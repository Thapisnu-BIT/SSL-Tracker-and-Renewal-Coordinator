import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '../../.env');

function loadOrCreateSecret() {
	const fromEnv = process.env.CERT_ENCRYPT_KEY;
	if (fromEnv && fromEnv.length >= 16) return fromEnv;

	try {
		const existing = fs.readFileSync(ENV_PATH, 'utf8');
		const match = existing.match(/^CERT_ENCRYPT_KEY=(.+)$/m);
		if (match && match[1].trim().length >= 16) return match[1].trim();
	} catch {
		/* .env may not exist yet */
	}

	const secret = crypto.randomBytes(24).toString('base64url');
	try {
		const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
		const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
		fs.appendFileSync(
			ENV_PATH,
			`${prefix}# Auto-generated: encrypts stored private keys (keyVault)\nCERT_ENCRYPT_KEY=${secret}\n`
		);
	} catch (err) {
		console.warn(`[keys] Could not persist CERT_ENCRYPT_KEY to .env: ${err.message}`);
	}
	process.env.CERT_ENCRYPT_KEY = secret;
	console.warn('[keys] CERT_ENCRYPT_KEY was missing — generated and appended to server/.env');
	return secret;
}

const SECRET = loadOrCreateSecret();

export function encrypt(plain) {
	const salt = crypto.randomBytes(16);
	const key = crypto.scryptSync(SECRET, salt, 32);
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
	const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
	return [
		salt.toString('base64'),
		iv.toString('base64'),
		cipher.getAuthTag().toString('base64'),
		data.toString('base64')
	].join('.');
}

export function decrypt(payload) {
	const parts = String(payload).split('.');
	if (parts.length !== 4) throw new Error('invalid encrypted payload');
	const [salt, iv, tag, data] = parts.map((p) => Buffer.from(p, 'base64'));
	const key = crypto.scryptSync(SECRET, salt, 32);
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export default { encrypt, decrypt };
