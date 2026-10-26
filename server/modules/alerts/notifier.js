import nodemailer from 'nodemailer';
import AlertLog from '../../models/AlertLog.js';

function buildSubject(domain, window, daysLeft) {
	const urgency = window === 'urgent' ? 'URGENT' : window === 'approaching' ? 'Warning' : 'Notice';
	return `[SSL Tracker] ${urgency}: ${domain} expires in ${daysLeft} days`;
}

function escapeHtml(value) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function resolveDeadline(deadline, daysLeft) {
	const d = new Date(deadline);
	if (!Number.isNaN(d.getTime())) return d;
	const n = Number(daysLeft);
	if (Number.isFinite(n)) return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
	return null;
}

function formatDeadline(deadline) {
	const d = new Date(deadline);
	if (Number.isNaN(d.getTime())) return String(deadline ?? '');
	return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function windowStyle(window) {
	if (window === 'expired' || window === 'urgent') {
		return { label: 'URGENT', fg: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
	}
	if (window === 'approaching') {
		return { label: 'WARNING', fg: '#b45309', bg: '#fffbeb', border: '#fde68a' };
	}
	return { label: 'NOTICE', fg: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' };
}

function buildText(domain, window, daysLeft, deadline) {
	const resolved = resolveDeadline(deadline, daysLeft);
	return [
		`Certificate renewal alert`,
		``,
		`Domain:      ${domain}`,
		`Window:      ${window}`,
		`Days left:   ${daysLeft}`,
		`Deadline:    ${resolved ? resolved.toUTCString() : '—'}`,
		``,
		`Please renew this certificate before it expires.`,
		``,
		`— SSL Tracker`
	].join('\n');
}

const BODY_FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO_FONT = "ui-monospace,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";

function detailRow(label, value, isLast) {
	const rule = isLast ? '' : 'border-bottom:1px solid #f1f5f9;';
	return [
		'<tr>',
		`<td style="padding:10px 0;font-family:${BODY_FONT};font-size:13px;color:#64748b;${rule}">${escapeHtml(label)}</td>`,
		`<td align="right" style="padding:10px 0;font-family:${BODY_FONT};font-size:13px;font-weight:600;color:#0f172a;${rule}">${value}</td>`,
		'</tr>'
	].join('');
}

export function buildHtml(domain, window, daysLeft, deadline) {
	const theme = windowStyle(window);
	const expired = window === 'expired';
	const absDays = Math.abs(Number(daysLeft));
	const resolved = resolveDeadline(deadline, daysLeft);
	const heroLine = expired
		? `${absDays} day${absDays === 1 ? '' : 's'} ago`
		: `${absDays} day${absDays === 1 ? '' : 's'}`;

	return [
		'<!DOCTYPE html>',
		'<html lang="en"><head><meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		'<title>SSL Tracker — certificate renewal alert</title>',
		'</head>',
		'<body style="margin:0;padding:0;background:#f1f5f9;">',
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;">',
		'<tr><td align="center" style="padding:32px 16px;">',
		'<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;">',
		'<tr><td style="height:4px;background:linear-gradient(90deg,#38bdf8,#0ea5e9);font-size:0;line-height:0;">&nbsp;</td></tr>',
		'<tr><td style="padding:24px 32px 0 32px;">',
		`<p style="margin:0;font-family:${BODY_FONT};font-size:16px;font-weight:700;color:#0f172a;">&#128274;&nbsp;SSL Tracker</p>`,
		`<p style="margin:4px 0 0 0;font-family:${BODY_FONT};font-size:13px;color:#64748b;">Automated certificate monitoring</p>`,
		'</td></tr>',
		'<tr><td style="padding:20px 32px 0 32px;">',
		`<span style="display:inline-block;background:${theme.bg};color:${theme.fg};border:1px solid ${theme.border};border-radius:999px;padding:4px 12px;font-family:${BODY_FONT};font-size:11px;font-weight:700;letter-spacing:0.8px;">${theme.label}</span>`,
		'</td></tr>',
		'<tr><td style="padding:20px 32px 0 32px;">',
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">',
		'<tr><td align="center" style="padding:28px 24px;">',
		`<p style="margin:0;font-family:${BODY_FONT};font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1.2px;">${expired ? 'Certificate expired' : 'Certificate expires in'}</p>`,
		`<p style="margin:10px 0 6px 0;font-family:${BODY_FONT};font-size:34px;font-weight:700;color:${theme.fg};">${escapeHtml(heroLine)}</p>`,
		`<p style="margin:0;font-family:${MONO_FONT};font-size:14px;color:#334155;">${escapeHtml(domain)}</p>`,
		'</td></tr></table>',
		'</td></tr>',
		'<tr><td style="padding:8px 32px 0 32px;">',
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
		detailRow('Domain', `<span style="font-family:${MONO_FONT};">${escapeHtml(domain)}</span>`, false),
		detailRow('Status', `<span style="color:${theme.fg};">${escapeHtml(String(window || '').toUpperCase())}</span>`, false),
		detailRow('Deadline', escapeHtml(resolved ? formatDeadline(resolved) : '—'), true),
		'</table>',
		'</td></tr>',
		'<tr><td style="padding:24px 32px 0 32px;">',
		`<p style="margin:0;font-family:${BODY_FONT};font-size:14px;line-height:1.6;color:#334155;">${expired ? 'This certificate has already expired. Renew it immediately to restore trusted HTTPS.' : 'Please renew this certificate before it expires to keep HTTPS trusted for your users.'}</p>`,
		'</td></tr>',
		'<tr><td style="padding:0 32px 28px 32px;">',
		`<p style="margin:24px 0 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-family:${BODY_FONT};font-size:12px;color:#94a3b8;">Sent by SSL Tracker &middot; Automated certificate monitoring</p>`,
		'</td></tr>',
		'</table>',
		'</td></tr></table>',
		'</body></html>'
	].join('\n');
}

function buildWebhookPayload(domain, window, daysLeft, deadline) {
	const resolved = resolveDeadline(deadline, daysLeft);
	return {
		text: `[SSL Tracker] ${domain}: certificate expires in ${daysLeft} days (${window})`,
		domain,
		window,
		daysLeft,
		deadline: resolved ? resolved.toISOString() : null,
		timestamp: new Date().toISOString()
	};
}

async function sendEmail(settings, { domain, window, daysLeft, deadline }) {
	if (!settings.smtpHost || !settings.smtpUser || !settings.smtpFrom) {
		return { status: 'skipped', error: 'SMTP not configured' };
	}

	const recipient = settings.alertEmailTo || settings.smtpUser;

	try {
		const transporter = nodemailer.createTransport({
			host: settings.smtpHost,
			port: settings.smtpPort || 587,
			secure: settings.smtpPort === 465,
			auth: {
				user: settings.smtpUser,
				pass: settings.smtpPass
			}
		});

		await transporter.sendMail({
			from: settings.smtpFrom,
			to: recipient,
			subject: buildSubject(domain, window, daysLeft),
			text: buildText(domain, window, daysLeft, deadline),
			html: buildHtml(domain, window, daysLeft, deadline)
		});

		return { status: 'sent', recipient };
	} catch (err) {
		return { status: 'failed', error: err.message };
	}
}

async function sendWebhook(settings, { domain, window, daysLeft, deadline }) {
	if (!settings.webhookUrl) {
		return { status: 'skipped', error: 'Webhook not configured' };
	}

	try {
		const res = await fetch(settings.webhookUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(buildWebhookPayload(domain, window, daysLeft, deadline))
		});

		if (!res.ok) {
			return { status: 'failed', error: `HTTP ${res.status}` };
		}
		return { status: 'sent', recipient: settings.webhookUrl };
	} catch (err) {
		return { status: 'failed', error: err.message };
	}
}

export async function fireAlerts(renewalEvents, settings, options = {}) {
	if (!renewalEvents || renewalEvents.length === 0) return;

	const force = options.force === true;
	const logs = [];

	for (const event of renewalEvents) {
		const shouldAlert =
			(event.window === 'urgent' && settings.alertOnUrgent) ||
			(event.window === 'approaching' && settings.alertOnApproaching) ||
			event.window === 'expired';

		if (!shouldAlert) continue;

		if (!force) {
			const existing = await AlertLog.findOne({
				domain: event.domain,
				window: event.window,
				createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
			});

			if (existing) continue;
		}

		const info = { domain: event.domain, window: event.window, daysLeft: event.daysLeft, deadline: event.deadline };

		const emailResult = await sendEmail(settings, info);
		await AlertLog.create({ type: 'email', ...info, message: buildSubject(event.domain, event.window, event.daysLeft), ...emailResult });
		logs.push({ type: 'email', ...emailResult });

		const webhookResult = await sendWebhook(settings, info);
		await AlertLog.create({ type: 'webhook', ...info, message: `Webhook: ${event.domain} ${event.window}`, ...webhookResult });
		logs.push({ type: 'webhook', ...webhookResult });
	}

	return logs;
}

export async function getAlertHistory(limit = 50) {
	return AlertLog.find().sort({ createdAt: -1 }).limit(limit).lean();
}

export async function sendTestAlert(type, settings) {
	const testInfo = {
		domain: 'test.example.com',
		window: 'urgent',
		daysLeft: 3,
		deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
	};

	let result;
	if (type === 'webhook') {
		result = await sendWebhook(settings, testInfo);
	} else {
		result = await sendEmail(settings, testInfo);
	}

	await AlertLog.create({
		type,
		...testInfo,
		message: `Test ${type} alert`,
		...result
	});

	return result;
}

export default { fireAlerts, getAlertHistory, sendTestAlert };