import Domain from '../../models/Domain.js';
import RenewalEvent from '../../models/RenewalEvent.js';
import { getSettings } from '../../models/Settings.js';
import { inspect } from '../inspection/inspector.js';
import { fireAlerts } from '../alerts/notifier.js';
import { issueCertificate, metaFromPem } from './issuer.js';
import { reloadPair } from './httpsServer.js';
import { encrypt } from './keyVault.js';

function computeWindow(daysLeft, warnDays) {
	if (daysLeft < 0) return 'expired';
	if (daysLeft <= warnDays * 0.25) return 'urgent';
	if (daysLeft <= warnDays * 0.5) return 'approaching';
	if (daysLeft <= warnDays) return 'upcoming';
	return null;
}

async function evaluateDomain(domain, settings, created, { force = false } = {}) {
	const daysLeft = domain.cert.rt;
	const window = computeWindow(daysLeft, settings.expiryWarnDays);

	if (!window) {
		await RenewalEvent.findOneAndUpdate(
			{ domain: domain.name, status: 'active' },
			{ $set: { status: 'completed' } }
		);
		return;
	}

	const event = await RenewalEvent.findOne({ domain: domain.name, status: 'active' });

	if (event) {
		const windowOrder = { upcoming: 0, approaching: 1, urgent: 2, expired: 3 };
		const upgraded = (windowOrder[window] || 0) > (windowOrder[event.window] || 0);
		await event.updateOne({
			$set: {
				deadline: new Date(domain.cert.to),
				daysLeft,
				window
			}
		});
		if (upgraded || force) {
			created.push({ domain: domain.name, window, daysLeft, upgraded, deadline: new Date(domain.cert.to) });
		}
	} else {
		await RenewalEvent.create({
			domain: domain.name,
			deadline: new Date(domain.cert.to),
			daysLeft,
			window,
			status: 'active'
		});
		created.push({ domain: domain.name, window, daysLeft, upgraded: false, deadline: new Date(domain.cert.to) });
	}
}

export async function evaluateRenewals() {
	const settings = await getSettings();
	const domains = await Domain.find({ cert: { $ne: null } }).lean();
	const created = [];

	for (const domain of domains) {
		await evaluateDomain(domain, settings, created);
	}

	return created;
}

export async function evaluateRenewalsAndAlert() {
	const settings = await getSettings();
	const created = await evaluateRenewals();
	if (created.length > 0) {
		try {
			await fireAlerts(created, settings);
		} catch (err) {
			console.error(`[alerts] Failed to fire alerts: ${err.message}`);
		}
	}
	return created;
}

export async function getActiveRenewals() {
	return RenewalEvent.find({ status: 'active' }).sort({ deadline: 1 }).lean();
}

export async function getRenewalHistory(limit = 50) {
	return RenewalEvent.find().sort({ createdAt: -1 }).limit(limit).lean();
}

export async function dismissRenewal(domain) {
	return RenewalEvent.findOneAndUpdate(
		{ domain: domain.toLowerCase().trim(), status: 'active' },
		{ $set: { status: 'dismissed' } },
		{ returnDocument: 'after' }
	);
}

export async function simulateExpiry(domainName, daysRemaining) {
	const name = domainName.toLowerCase().trim();
	const now = new Date();
	const fakeTo = new Date(now.getTime() + daysRemaining * 24 * 60 * 60 * 1000);

	const fakeCert = {
		origin: { CN: name },
		issuer: { CN: 'Simulated CA' },
		from: now.toUTCString(),
		to: fakeTo.toUTCString(),
		sn: 'SIM' + Date.now().toString(16).toUpperCase(),
		altNames: [`DNS:${name}`],
		rt: daysRemaining
	};

	const domain = await Domain.findOneAndUpdate(
		{ name },
		{
			$set: {
				cert: fakeCert,
				status: daysRemaining < 0 ? 'expired' : daysRemaining <= 30 ? 'warn' : 'ok',
				lastCheckedAt: new Date(),
				lastStatusChangeAt: new Date()
			}
		},
		{ returnDocument: 'after' }
	);

	if (!domain) return null;

	const settings = await getSettings();
	const created = [];
	await evaluateDomain(domain, settings, created, { force: true });
	if (created.length > 0) {
		try {
			await fireAlerts(created, settings, { force: true });
		} catch (err) {
			console.error(`[alerts] Failed to fire simulation alerts: ${err.message}`);
		}
	}
	return { domain: name, daysRemaining, renewalEvents: created };
}

export async function renewCertificate(domainName, settings) {
	const name = String(domainName || '').toLowerCase().trim();
	const domain = await Domain.findOne({ name });
	if (!domain) return null;

	const issued = await issueCertificate(name, settings);
	const meta = metaFromPem(issued.certPem);
	const warnDays = settings.expiryWarnDays || 30;
	const newStatus = meta.rt < 0 ? 'expired' : meta.rt <= warnDays ? 'warn' : 'ok';

	await Domain.updateOne(
		{ name },
		{
			$set: {
				cert: meta,
				certPem: issued.certPem,
				keyPemEnc: encrypt(issued.keyPem),
				issuedBy: issued.issuedBy,
				renewedAt: new Date(),
				lastCheckedAt: new Date(),
				status: newStatus,
				...(domain.status !== newStatus ? { lastStatusChangeAt: new Date() } : {})
			}
		}
	);

	const active = await RenewalEvent.findOne({ domain: name, status: 'active' });
	if (active) {
		await active.updateOne({ $set: { status: 'completed' } });
	} else {
		await RenewalEvent.create({
			domain: name,
			deadline: new Date(meta.to),
			daysLeft: meta.rt,
			window: computeWindow(meta.rt, warnDays) || 'upcoming',
			status: 'completed'
		});
	}

	reloadPair(issued.keyPem, issued.certPem);

	return {
		domain: name,
		issuedBy: issued.issuedBy,
		to: meta.to,
		rt: meta.rt,
		renewedAt: new Date()
	};
}

export default {
	evaluateRenewals,
	evaluateRenewalsAndAlert,
	getActiveRenewals,
	getRenewalHistory,
	dismissRenewal,
	simulateExpiry,
	renewCertificate
};