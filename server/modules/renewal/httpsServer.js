import https from 'node:https';
import Domain from '../../models/Domain.js';
import { decrypt } from './keyVault.js';
import { issueSelfSigned } from './issuer.js';

let server = null;
let currentPort = null;

async function loadLatestPair() {
	const doc = await Domain.findOne({ certPem: { $ne: null }, keyPemEnc: { $ne: null } })
		.sort({ renewedAt: -1 })
		.select('certPem keyPemEnc name')
		.lean();
	if (!doc || !doc.certPem || !doc.keyPemEnc) return null;
	try {
		return { cert: doc.certPem, key: decrypt(doc.keyPemEnc), name: doc.name };
	} catch (err) {
		console.warn(`[https] Could not decrypt stored key for ${doc.name}: ${err.message}`);
		return null;
	}
}

export async function startHttpsServer(app, port, settings) {
	currentPort = Number(port) || 8443;

	let pair = await loadLatestPair();
	if (!pair) {
		const pems = await issueSelfSigned('localhost', settings);
		pair = { cert: pems.certPem, key: pems.keyPem, name: 'localhost (bootstrap)' };
		console.log('[https] No stored certificate — bootstrapped self-signed cert for localhost');
	}

	server = https.createServer({ key: pair.key, cert: pair.cert }, app);

	await new Promise((resolve, reject) => {
		const onError = (err) => {
			server = null;
			reject(err);
		};
		server.once('error', onError);
		server.listen(currentPort, () => {
			server.removeListener('error', onError);
			resolve();
		});
	});

	console.log(`[https] Serving on https://localhost:${currentPort} (cert: ${pair.name})`);
	return server;
}

export function reloadPair(keyPem, certPem) {
	if (!server || !server.listening) {
		console.warn('[https] Cannot swap certificate — HTTPS listener is not running');
		return false;
	}
	server.setSecureContext({ key: keyPem, cert: certPem });
	console.log('[https] TLS certificate hot-swapped (no restart needed)');
	return true;
}

export function getHttpsInfo() {
	return { running: Boolean(server && server.listening), port: currentPort };
}

export default { startHttpsServer, reloadPair, getHttpsInfo };
