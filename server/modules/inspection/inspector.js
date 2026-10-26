import tls from 'node:tls';
import { certTimeoutMs } from '../../config.js';

function inspect(name, timeoutMs = certTimeoutMs) {
	return new Promise((resolve, reject) => {
		const opts = {
			host: name,
			port: 443,
			servername: name,
			rejectUnauthorized: false
		};

		const conn = tls.connect(opts, () => {
			const cert = conn.getPeerCertificate();
			conn.destroy();

			if (!cert || Object.keys(cert).length === 0) {
				reject(new Error(`no certificate presented by ${name}`));
				return;
			}
			resolve(formatCert(cert));
		});

		conn.setTimeout(timeoutMs, () => {
			conn.destroy();
			reject(new Error(`connection to ${name} timed out after ${timeoutMs}ms`));
		});

		conn.on('error', (err) => {
			conn.destroy();
			reject(err);
		});
	});
}

function calcRemTime(end) {
	const d2 = new Date(end);
	const rem = (d2 - Date.now()) / (1000 * 60 * 60 * 24);
	return Math.round(rem);
}

function sanitizeSubject(subject) {
	if (!subject || typeof subject !== 'object') return {};
	const out = {};
	for (const key of ['C', 'ST', 'L', 'O', 'OU', 'CN']) {
		if (subject[key]) out[key] = subject[key];
	}
	return out;
}

function formatCert(cert) {
	return {
		origin: sanitizeSubject(cert.subject),
		issuer: sanitizeSubject(cert.issuer),
		from: cert.valid_from,
		to: cert.valid_to,
		sn: cert.serialNumber,
		altNames: (cert.subjectaltname || '').split(', ').filter(Boolean),
		rt: calcRemTime(cert.valid_to)
	};
}

export { inspect, calcRemTime, formatCert };
