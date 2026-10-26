import express from 'express';
import cors from 'cors';
import { host, port } from './config.js';
import { connectDB } from './db.js';
import { inspect } from './modules/inspection/inspector.js';
import registry from './modules/registry/controller.js';
import scheduler, { startScan } from './modules/monitoring/scheduler.js';
import ScanLog from './models/ScanLog.js';
import { getSettings, updateSettings, INTERNAL_KEYS } from './models/Settings.js';
import coordinator from './modules/renewal/coordinator.js';
import notifier from './modules/alerts/notifier.js';
import { startHttpsServer } from './modules/renewal/httpsServer.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/certs', async (req, res) => {
	const name = (req.query.name || '').trim();
	if (!name) {
		res.status(400).json({ error: 'Missing required query parameter: name' });
		return;
	}
	try {
		const cert = await inspect(name);
		res.json({ name, ...cert });
	} catch (err) {
		res.status(502).json({ error: `Could not reach ${name}: ${err.message}`, name });
	}
});

app.get('/api/tracked', async (req, res) => {
	try {
		res.json(await registry.list());
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.get('/api/tracked/:name', async (req, res) => {
	try {
		const domain = await registry.get(req.params.name);
		if (!domain) {
			res.status(404).json({ error: `Not tracked: ${req.params.name}` });
			return;
		}
		res.json(domain);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.post('/api/tracked', async (req, res) => {
	const name = (req.body?.name || '').trim();
	if (!name) {
		res.status(400).json({ error: 'Missing required field: name' });
		return;
	}
	try {
		const domain = await registry.upsert(name, req.body?.cert || null);
		res.status(201).json(domain);
	} catch (err) {
		res.status(502).json({ error: `Could not track ${name}: ${err.message}` });
	}
});

app.delete('/api/tracked/:name', async (req, res) => {
	try {
		const domain = await registry.remove(req.params.name);
		if (!domain) {
			res.status(404).json({ error: `Not tracked: ${req.params.name}` });
			return;
		}
		res.json({ removed: domain.name });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.post('/api/scan', async (req, res) => {
	try {
		const result = await startScan();
		if (result.error) {
			res.status(409).json(result);
			return;
		}
		res.json(result);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.get('/api/scan-log', async (req, res) => {
	try {
		const limit = Math.min(Number(req.query.limit) || 20, 100);
		const logs = await ScanLog.find().sort({ startedAt: -1 }).limit(limit).lean();
		res.json(logs);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

function publicSettings(settings) {
	for (const k of INTERNAL_KEYS) delete settings[k];
	return settings;
}

app.get('/api/settings', async (req, res) => {
	try {
		res.json(publicSettings(await getSettings()));
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.put('/api/settings', async (req, res) => {
	try {
		const settings = await updateSettings(req.body || {});
		scheduler.rescheduleScheduler(settings.scanIntervalMin);
		scheduler.updateWarnDays(settings.expiryWarnDays);
		res.json(publicSettings(settings));
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.get('/api/renewals', async (req, res) => {
	try {
		res.json(await coordinator.getActiveRenewals());
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.get('/api/renewals/history', async (req, res) => {
	try {
		const limit = Math.min(Number(req.query.limit) || 50, 200);
		res.json(await coordinator.getRenewalHistory(limit));
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.post('/api/renewals/:domain/dismiss', async (req, res) => {
	try {
		const event = await coordinator.dismissRenewal(req.params.domain);
		if (!event) {
			res.status(404).json({ error: `No active renewal for ${req.params.domain}` });
			return;
		}
		res.json(event);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.post('/api/renewals/simulate', async (req, res) => {
	const { domain, daysRemaining } = req.body || {};
	if (!domain || daysRemaining === undefined) {
		res.status(400).json({ error: 'Missing required fields: domain, daysRemaining' });
		return;
	}
	try {
		const result = await coordinator.simulateExpiry(domain, Number(daysRemaining));
		if (!result) {
			res.status(404).json({ error: `Domain not tracked: ${domain}` });
			return;
		}
		res.json(result);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.post('/api/renewals/:domain/renew', async (req, res) => {
	try {
		const settings = await getSettings();
		const result = await coordinator.renewCertificate(req.params.domain, settings);
		if (!result) {
			res.status(404).json({ error: `Not tracked: ${req.params.domain}` });
			return;
		}
		res.json(result);
	} catch (err) {
		res.status(502).json({ error: `Renewal failed: ${err.message}` });
	}
});

app.get('/api/alerts', async (req, res) => {
	try {
		const limit = Math.min(Number(req.query.limit) || 50, 200);
		res.json(await notifier.getAlertHistory(limit));
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.post('/api/alerts/test', async (req, res) => {
	const type = req.body?.type || 'webhook';
	if (type !== 'email' && type !== 'webhook') {
		res.status(400).json({ error: 'type must be "email" or "webhook"' });
		return;
	}
	try {
		const settings = await getSettings();
		const result = await notifier.sendTestAlert(type, settings);
		res.json({ type, ...result });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.use((req, res) => {
	res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

connectDB()
	.then(async () => {
		const settings = await getSettings();
		scheduler.startScheduler(settings.scanIntervalMin, settings.expiryWarnDays);
		app.listen(port, host, () => {
			console.log(`SSL Tracker API online on http://${host}:${port}`);
		});
		startHttpsServer(app, settings.httpsPort, settings).catch((err) => {
			console.error(`[https] HTTPS listener not started: ${err.message}`);
		});
	})
	.catch((err) => {
		console.error(`Failed to start: ${err.message}`);
		process.exit(1);
	});