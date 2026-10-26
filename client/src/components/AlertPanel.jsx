import React from 'react';

function timeAgo(date) {
	if (!date) return '—';
	const ms = Date.now() - new Date(date).getTime();
	const s = Math.floor(ms / 1000);
	if (s < 60) return 'just now';
	const m = Math.floor(s / 60);
	if (m < 60) return `${m} min ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h} h ago`;
	return `${Math.floor(h / 24)} d ago`;
}

export function AlertPanel({ toast }) {
	const [logs, setLogs] = React.useState([]);
	const [loading, setLoading] = React.useState(true);
	const [testType, setTestType] = React.useState('webhook');
	const [testing, setTesting] = React.useState(false);

	function loadLogs() {
		setLoading(true);
		fetch('/api/alerts')
			.then((r) => r.json())
			.then(setLogs)
			.catch(() => setLogs([]))
			.finally(() => setLoading(false));
	}

	React.useEffect(loadLogs, []);

	async function sendTest() {
		setTesting(true);
		try {
			const res = await fetch('/api/alerts/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: testType })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
			toast('success', `Test ${testType} alert: ${data.status}`);
			loadLogs();
		} catch (err) {
			toast('error', `Test alert failed: ${err.message}`);
		} finally {
			setTesting(false);
		}
	}

	return (
		<div className="panel">
			<div className="panel__head">
				<div>
					<h2 className="panel__title">Alerts</h2>
					<p className="panel__sub">Email and webhook notifications — configure SMTP / webhook in Settings</p>
				</div>
			</div>

			<div className="renewal-sim">
				<div className="settings-field__row">
					<select className="field field--sm" value={testType} onChange={(e) => setTestType(e.target.value)} disabled={testing}>
						<option value="webhook">Webhook</option>
						<option value="email">Email</option>
					</select>
					<button className="btn btn--secondary" onClick={sendTest} disabled={testing}>
						{testing ? 'Sending…' : 'Send test alert'}
					</button>
				</div>
			</div>

			{loading ? (
				<div className="skeleton" style={{ marginTop: 16 }}>
					{[...Array(3)].map((_, i) => <div key={i} className="skeleton__row" />)}
				</div>
			) : logs.length === 0 ? (
				<div className="empty" style={{ paddingTop: 20 }}>
					<span className="empty__icon">{"\u{1F514}"}</span>
					<p>No alerts sent yet</p>
					<p className="empty__hint">Alerts fire automatically on renewal events, or send a test above.</p>
				</div>
			) : (
				<table className="table" style={{ marginTop: 16 }}>
					<thead>
						<tr>
							<th>Time</th>
							<th>Type</th>
							<th>Domain</th>
							<th className="hide-sm">Window</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{logs.map((log) => (
							<tr key={log._id}>
								<td className="muted-cell">{timeAgo(log.createdAt)}</td>
								<td>
									<span className={`pill pill--renewal pill--renewal-${log.type === 'email' ? 'upcoming' : 'approaching'}`}>
										{log.type}
									</span>
								</td>
								<td className="td-domain">{log.domain}</td>
								<td className="hide-sm muted-cell">{log.window}</td>
								<td>
									<span className={`pill pill--renewal pill--renewal-${log.status === 'sent' ? 'upcoming' : log.status === 'failed' ? 'urgent' : 'none'}`}>
										{log.status}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}