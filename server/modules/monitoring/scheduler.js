import Domain from '../../models/Domain.js';
import ScanLog from '../../models/ScanLog.js';
import { inspect } from '../inspection/inspector.js';
import { metaFromPem } from '../renewal/issuer.js';
import { evaluateRenewalsAndAlert } from '../renewal/coordinator.js';

let scanning = false;
let scanTimer = null;
let currentIntervalMin = 60;
let currentWarnDays = 30;

function computeStatus(rt) {
	if (rt === null || rt === undefined) return 'unknown';
	if (rt < 0) return 'expired';
	if (rt <= currentWarnDays) return 'warn';
	return 'ok';
}

async function resolveCert(domain) {
	if (domain.certPem) {
		try {
			return metaFromPem(domain.certPem);
		} catch (err) {
			console.warn(`[scheduler] Stored cert for ${domain.name} unreadable (${err.message}) — falling back to live inspection`);
		}
	}
	return inspect(domain.name);
}

export async function startScan() {
	if (scanning) {
		return { error: 'Scan already in progress' };
	}

	scanning = true;
	const startedAt = new Date();
	const domains = await Domain.find().lean();
	const results = { ok: 0, warn: 0, expired: 0, unreachable: 0, scanErrors: [] };

	for (const domain of domains) {
		try {
			const cert = await resolveCert(domain);
			const newStatus = computeStatus(cert.rt);
			const statusChanged = domain.status !== newStatus;

			await Domain.findOneAndUpdate(
				{ name: domain.name },
				{
					$set: {
						cert,
						status: newStatus,
						lastCheckedAt: new Date(),
						...(statusChanged ? { lastStatusChangeAt: new Date() } : {})
					}
				}
			);

			results[newStatus] = (results[newStatus] || 0) + 1;
		} catch (err) {
			await Domain.findOneAndUpdate(
				{ name: domain.name },
				{ $set: { status: 'unreachable', lastCheckedAt: new Date() } }
			);
			results.unreachable++;
			results.scanErrors.push({ domain: domain.name, error: err.message });
		}
	}

	const completedAt = new Date();
	const duration = completedAt.getTime() - startedAt.getTime();

	const log = await ScanLog.create({
		startedAt,
		completedAt,
		duration,
		scanned: domains.length,
		ok: results.ok,
		warn: results.warn,
		expired: results.expired,
		unreachable: results.unreachable,
		scanErrors: results.scanErrors
	});

	let renewalEvents = [];
	try {
		renewalEvents = await evaluateRenewalsAndAlert();
	} catch (err) {
		console.error(`[scheduler] Renewal evaluation failed: ${err.message}`);
	}

	scanning = false;

	return {
		logId: log._id,
		scanned: domains.length,
		ok: results.ok,
		warn: results.warn,
		expired: results.expired,
		unreachable: results.unreachable,
		duration,
		errors: results.scanErrors,
		renewalEvents
	};
}

function scheduleNext() {
	if (scanTimer) clearInterval(scanTimer);
	const ms = currentIntervalMin * 60 * 1000;
	scanTimer = setInterval(async () => {
		console.log(`[scheduler] Starting scheduled scan at ${new Date().toISOString()}`);
		try {
			const result = await startScan();
			if (result.error) {
				console.log(`[scheduler] ${result.error}`);
			} else {
				console.log(
					`[scheduler] Scan complete: ${result.scanned} scanned, ${result.ok} ok, ${result.warn} warn, ${result.expired} expired, ${result.unreachable} unreachable (${result.duration}ms)`
				);
			}
		} catch (err) {
			console.error(`[scheduler] Scan failed: ${err.message}`);
		}
	}, ms);
	console.log(`[scheduler] Scheduled every ${currentIntervalMin} min`);
}

export function startScheduler(intervalMin, warnDays) {
	currentIntervalMin = intervalMin || 60;
	currentWarnDays = warnDays || 30;
	scheduleNext();
}

export function rescheduleScheduler(intervalMin) {
	currentIntervalMin = intervalMin || 60;
	scheduleNext();
}

export function updateWarnDays(days) {
	currentWarnDays = days || 30;
}

export function getScanning() {
	return scanning;
}

export default { startScan, startScheduler, rescheduleScheduler, updateWarnDays, getScanning };