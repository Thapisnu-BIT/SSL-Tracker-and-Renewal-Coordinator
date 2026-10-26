import { X509Certificate } from 'node:crypto';
import acme from 'acme-client';
import selfsigned from 'selfsigned';
import { calcRemTime } from '../inspection/inspector.js';
import { encrypt, decrypt } from './keyVault.js';
import { updateInternalSettings } from '../../models/Settings.js';

const DNS_RECORDS = new Map();

function parseDn(str) {
	const out = {};
	if (!str) return out;
	for (const line of String(str).split('\n')) {
		const idx = line.indexOf('=');
		if (idx === -1) continue;
		const k = line.slice(0, idx).trim();
		const v = line.slice(idx + 1).trim();
		if (['C', 'ST', 'L', 'O', 'OU', 'CN'].includes(k) && v) out[k] = v;
	}
	return out;
}

function metaFromPem(certPem) {
	const x = new X509Certificate(certPem);
	return {
		origin: parseDn(x.subject),
		issuer: parseDn(x.issuer),
		from: new Date(x.validFrom).toISOString(),
		to: new Date(x.validTo).toISOString(),
		sn: x.serialNumber,
		altNames: (x.subjectAltName || '').split(', ').filter(Boolean),
		rt: calcRemTime(x.validTo)
	};
}

async function ensureCa(settings) {
	if (settings.caCertPem && settings.caKeyPemEnc) {
		try {
			return { cert: settings.caCertPem, key: decrypt(settings.caKeyPemEnc) };
		} catch {
			/* stale/undecryptable — regenerate below */
		}
	}
	const ca = await selfsigned.generate([{ name: 'commonName', value: 'SSL Tracker CA' }], {
		notAfterDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
		keySize: 2048,
		extensions: [
			{ name: 'basicConstraints', cA: true },
			{ name: 'keyUsage', keyCertSign: true, cRLSign: true }
		]
	});
	await updateInternalSettings({ caCertPem: ca.cert, caKeyPemEnc: encrypt(ca.private) });
	return { cert: ca.cert, key: ca.private };
}

async function issueSelfSigned(domain, settings) {
	const ca = await ensureCa(settings);
	const pems = await selfsigned.generate([{ name: 'commonName', value: domain }], {
		notAfterDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
		keySize: 2048,
		extensions: [
			{ name: 'basicConstraints', cA: false },
			{ name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
			{ name: 'extKeyUsage', serverAuth: true },
			{ name: 'subjectAltName', altNames: [{ type: 2, value: domain }] }
		],
		ca: { cert: ca.cert, key: ca.key }
	});
	return { certPem: pems.cert, keyPem: pems.private, issuedBy: 'selfsigned' };
}

export function acmeConfigured(settings) {
	return Boolean(settings.acmeEmail && settings.acmeDnsToken);
}

async function cloudflare(pathname, token, method = 'GET', body) {
	const res = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: body ? JSON.stringify(body) : undefined
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok || !data.success) {
		const msg = Array.isArray(data.errors) ? data.errors.map((e) => e.message).join('; ') : '';
		throw new Error(`Cloudflare API ${method} ${pathname} failed: ${msg || `HTTP ${res.status}`}`);
	}
	return data.result;
}

async function findCloudflareZone(domain, token) {
	const labels = String(domain).split('.');
	for (let i = 0; i < labels.length; i++) {
		const candidate = labels.slice(i).join('.');
		const zones = await cloudflare(`/zones?name=${encodeURIComponent(candidate)}&status=active`, token);
		if (Array.isArray(zones) && zones.length > 0) return zones[0].id;
	}
	throw new Error(`No active Cloudflare zone found for ${domain} (or token lacks Zone:Read)`);
}

async function issueAcme(domain, settings) {
	const directoryUrl = settings.acmeDirectoryUrl || 'https://acme-v02.api.letsencrypt.org/directory';
	const token = settings.acmeDnsToken;

	let accountKey = null;
	if (settings.acmeAccountKeyEnc) {
		try {
			accountKey = decrypt(settings.acmeAccountKeyEnc);
		} catch {
			accountKey = null;
		}
	}
	if (!accountKey) {
		accountKey = await acme.crypto.createPrivateRsaKey(2048);
	}

	const client = new acme.Client({
		directoryUrl,
		accountKey,
		backoffAttempts: 8,
		backoffMin: 2000,
		backoffMax: 15000
	});

	const [certificateKey, csr] = await acme.crypto.createCsr({
		commonName: domain,
		altNames: [domain]
	});

	let zoneId = null;

	const certificate = await client.auto({
		csr,
		email: settings.acmeEmail,
		termsOfServiceAgreed: true,
		challengePriority: ['dns-01'],
		skipChallengeVerification: true,
		challengeCreateFn: async (authz, challenge, keyAuthorization) => {
			const identifier = authz.identifier.value;
			zoneId = await findCloudflareZone(identifier, token);
			const recordName = `_acme-challenge.${identifier}`;
			const record = await cloudflare(
				`/zones/${zoneId}/dns_records`,
				token,
				'POST',
				{ type: 'TXT', name: recordName, content: keyAuthorization, ttl: 120 }
			);
			DNS_RECORDS.set(challenge.token, { zoneId, recordId: record.id });
		},
		challengeRemoveFn: async (authz, challenge) => {
			const entry = DNS_RECORDS.get(challenge.token);
			if (!entry) return;
			DNS_RECORDS.delete(challenge.token);
			await cloudflare(
				`/zones/${entry.zoneId}/dns_records/${entry.recordId}`,
				token,
				'DELETE'
			);
		}
	});

	if (!settings.acmeAccountKeyEnc) {
		await updateInternalSettings({ acmeAccountKeyEnc: encrypt(accountKey) });
	}

	return { certPem: String(certificate), keyPem: certificateKey, issuedBy: 'acme' };
}

export async function issueCertificate(domain, settings) {
	const mode = ['acme', 'selfsigned'].includes(settings.renewalMode) ? settings.renewalMode : 'auto';

	if (mode === 'selfsigned') return issueSelfSigned(domain, settings);

	if (!acmeConfigured(settings)) {
		if (mode === 'acme') {
			throw new Error('ACME mode selected, but ACME email or Cloudflare DNS token is missing in Settings');
		}
		return issueSelfSigned(domain, settings);
	}

	return issueAcme(domain, settings);
}

export { metaFromPem, issueSelfSigned };

export default { issueCertificate, acmeConfigured, metaFromPem, issueSelfSigned };
