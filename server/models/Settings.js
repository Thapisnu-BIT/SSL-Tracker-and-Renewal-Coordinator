import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
	{
		scanIntervalMin: { type: Number, default: 60, min: 1, max: 1440 },
		clientRefreshSec: { type: Number, default: 30, min: 5, max: 300 },
		expiryWarnDays: { type: Number, default: 30, min: 1, max: 90 },
		smtpHost: { type: String, default: '' },
		smtpPort: { type: Number, default: 587 },
		smtpUser: { type: String, default: '' },
		smtpPass: { type: String, default: '' },
		smtpFrom: { type: String, default: '' },
		alertEmailTo: { type: String, default: '' },
		webhookUrl: { type: String, default: '' },
		alertOnApproaching: { type: Boolean, default: true },
		alertOnUrgent: { type: Boolean, default: true },
		renewalMode: { type: String, default: 'auto' },
		acmeEmail: { type: String, default: '' },
		acmeDirectoryUrl: { type: String, default: 'https://acme-v02.api.letsencrypt.org/directory' },
		acmeDnsToken: { type: String, default: '' },
		acmeAccountKeyEnc: { type: String, default: '' },
		caCertPem: { type: String, default: '' },
		caKeyPemEnc: { type: String, default: '' },
		httpsPort: { type: Number, default: 8443, min: 1, max: 65535 }
	},
	{ timestamps: true }
);

const Settings = mongoose.model('Settings', settingsSchema);

const DEFAULTS = {
	scanIntervalMin: 60,
	clientRefreshSec: 30,
	expiryWarnDays: 30,
	smtpHost: '',
	smtpPort: 587,
	smtpUser: '',
	smtpPass: '',
	smtpFrom: '',
	alertEmailTo: '',
	webhookUrl: '',
	alertOnApproaching: true,
	alertOnUrgent: true,
	renewalMode: 'auto',
	acmeEmail: '',
	acmeDirectoryUrl: 'https://acme-v02.api.letsencrypt.org/directory',
	acmeDnsToken: '',
	acmeAccountKeyEnc: '',
	caCertPem: '',
	caKeyPemEnc: '',
	httpsPort: 8443
};

const STRING_KEYS = ['smtpHost', 'smtpUser', 'smtpPass', 'smtpFrom', 'alertEmailTo', 'webhookUrl', 'renewalMode', 'acmeEmail', 'acmeDirectoryUrl', 'acmeDnsToken'];
const NUMBER_KEYS = ['scanIntervalMin', 'clientRefreshSec', 'expiryWarnDays', 'smtpPort', 'httpsPort'];
const BOOL_KEYS = ['alertOnApproaching', 'alertOnUrgent'];

export const INTERNAL_KEYS = ['acmeAccountKeyEnc', 'caCertPem', 'caKeyPemEnc'];

export async function getSettings() {
	let doc = await Settings.findOne().lean();
	if (!doc) {
		doc = await Settings.create(DEFAULTS);
		doc = doc.toObject();
	}
	const out = {};
	for (const k of Object.keys(DEFAULTS)) out[k] = doc[k] ?? DEFAULTS[k];
	return out;
}

export async function updateSettings(patch) {
	const update = {};
	for (const k of STRING_KEYS) {
		if (patch[k] !== undefined) update[k] = String(patch[k]);
	}
	for (const k of NUMBER_KEYS) {
		if (patch[k] !== undefined) update[k] = Number(patch[k]);
	}
	for (const k of BOOL_KEYS) {
		if (patch[k] !== undefined) update[k] = Boolean(patch[k]);
	}
	if (Object.keys(update).length === 0) return getSettings();

	let doc = await Settings.findOne();
	if (!doc) {
		doc = await Settings.create({ ...DEFAULTS, ...update });
	} else {
		doc.set(update);
		await doc.save();
	}
	const out = {};
	for (const k of Object.keys(DEFAULTS)) out[k] = doc[k] ?? DEFAULTS[k];
	return out;
}

export async function updateInternalSettings(patch) {
	let doc = await Settings.findOne();
	if (!doc) doc = await Settings.create(DEFAULTS);
	for (const [k, v] of Object.entries(patch)) {
		if (INTERNAL_KEYS.includes(k)) doc.set(k, v);
	}
	await doc.save();
	const out = {};
	for (const key of Object.keys(DEFAULTS)) out[key] = doc[key] ?? DEFAULTS[key];
	return out;
}

export default { getSettings, updateSettings, updateInternalSettings };