import React from 'react';

function formatDate(d) {
	if (!d) return '—';
	return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(d) {
	if (!d) return null;
	const ms = new Date(d).getTime() - Date.now();
	return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

const WINDOW_CLS = {
	upcoming: 'upcoming',
	approaching: 'approaching',
	urgent: 'urgent',
	expired: 'expired'
};

function RenewalBadge({ window, daysLeft }) {
	const cls = WINDOW_CLS[window] || 'none';
	const label = window === 'expired' ? 'expired' : `${daysLeft}d`;
	return (
		<span className={`pill pill--renewal pill--renewal-${cls}`}>
			<span className="pill__dot" />
			{label}
		</span>
	);
}

export function RenewalPanel({ toast }) {
	const [active, setActive] = React.useState([]);
	const [history, setHistory] = React.useState([]);
	const [loading, setLoading] = React.useState(true);
	const [simDomain, setSimDomain] = React.useState('');
	const [simDays, setSimDays] = React.useState(5);
	const [simulating, setSimulating] = React.useState(false);
	const [renewing, setRenewing] = React.useState('');
	const [trackedNames, setTrackedNames] = React.useState([]);

	function loadActive() {
		return fetch('/api/renewals')
			.then((r) => r.json())
			.then(setActive)
			.catch(() => setActive([]));
	}

	function loadHistory() {
		return fetch('/api/renewals/history')
			.then((r) => r.json())
			.then(setHistory)
			.catch(() => setHistory([]));
	}

	function loadTracked() {
		return fetch('/api/tracked')
			.then((r) => r.json())
			.then((data) => setTrackedNames(data.map((d) => d.name)))
			.catch(() => {});
	}

	function loadAll() {
		setLoading(true);
		Promise.all([loadActive(), loadHistory(), loadTracked()]).finally(() => setLoading(false));
	}

	React.useEffect(loadAll, []);

	async function dismiss(domain) {
		try {
			const res = await fetch(`/api/renewals/${encodeURIComponent(domain)}/dismiss`, { method: 'POST' });
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || `HTTP ${res.status}`);
			}
			toast('success', `Dismissed renewal for ${domain}`);
			loadActive();
			loadHistory();
		} catch (err) {
			toast('error', err.message);
		}
	}

	async function renew(domain) {
		setRenewing(domain);
		try {
			const res = await fetch(`/api/renewals/${encodeURIComponent(domain)}/renew`, { method: 'POST' });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
			const via = data.issuedBy === 'acme' ? "Let's Encrypt" : 'SSL Tracker CA';
			toast('success', `Renewed ${domain} via ${via} — valid ${data.rt} days`);
			loadAll();
		} catch (err) {
			toast('error', `Renew failed: ${err.message}`);
		} finally {
			setRenewing('');
		}
	}

	async function simulate() {
		if (!simDomain) return;
		setSimulating(true);
		try {
			const res = await fetch('/api/renewals/simulate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ domain: simDomain, daysRemaining: Number(simDays) })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
			toast('success', `Simulated ${simDomain} at ${simDays} days remaining`);
			loadAll();
		} catch (err) {
			toast('error', `Simulate failed: ${err.message}`);
		} finally {
			setSimulating(false);
		}
	}

	return (
		<div className="panel">
			<div className="panel__head">
				<div>
					<h2 className="panel__title">Renewals</h2>
					<p className="panel__sub">Upcoming certificate renewals — evaluated after each scan</p>
				</div>
			</div>

			{loading ? (
				<div className="skeleton">
					{[...Array(3)].map((_, i) => <div key={i} className="skeleton__row" />)}
				</div>
			) : active.length === 0 ? (
				<div className="empty">
					<span className="empty__icon">{"\u2714"}</span>
					<p>No upcoming renewals</p>
					<p className="empty__hint">All tracked certificates are healthy, or simulate a near-expiry to test.</p>
				</div>
			) : (
				<table className="table">
					<thead>
						<tr>
							<th>Domain</th>
							<th>Deadline</th>
							<th>Remaining</th>
							<th className="hide-sm">Window</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{active.map((ev) => (
							<tr key={ev.domain}>
								<td className="td-domain">{ev.domain}</td>
								<td className="mono">{formatDate(ev.deadline)}</td>
								<td><RenewalBadge window={ev.window} daysLeft={ev.daysLeft} /></td>
								<td className="hide-sm muted-cell">{ev.window}</td>
								<td>
									<div className="td-actions">
										<button className="btn btn--primary" onClick={() => renew(ev.domain)} disabled={Boolean(renewing)}>
											{renewing === ev.domain ? 'Renewing…' : 'Renew now'}
										</button>
										<button className="btn btn--danger" onClick={() => dismiss(ev.domain)} disabled={Boolean(renewing)}>
											Dismiss
										</button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{history.length > 0 && (
				<div className="renewal-history">
					<h3 className="panel__sub" style={{ marginTop: 20, marginBottom: 10 }}>History</h3>
					<table className="table">
						<thead>
							<tr>
								<th>Domain</th>
								<th>Deadline</th>
								<th className="hide-sm">Window</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{history.slice(0, 10).map((ev) => (
								<tr key={ev._id}>
									<td className="td-domain">{ev.domain}</td>
									<td className="mono">{formatDate(ev.deadline)}</td>
									<td className="hide-sm muted-cell">{ev.window}</td>
									<td>
										<span className={`pill pill--renewal pill--renewal-${ev.status === 'dismissed' ? 'none' : ev.window}`}>
											{ev.status}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<div className="renewal-sim">
				<h3 className="panel__sub" style={{ marginTop: 20, marginBottom: 10 }}>Simulate near-expiry</h3>
				<div className="settings-field__row">
					<select
						className="field field--sm"
						value={simDomain}
						onChange={(e) => setSimDomain(e.target.value)}
						disabled={simulating || trackedNames.length === 0}
					>
						<option value="">{trackedNames.length ? 'Select domain' : 'No tracked domains'}</option>
						{trackedNames.map((n) => <option key={n} value={n}>{n}</option>)}
					</select>
					<input
						type="number"
						className="field field--sm"
						value={simDays}
						onChange={(e) => setSimDays(Math.max(-7, Math.min(90, Number(e.target.value) || 1)))}
						min={-7}
						max={90}
						disabled={simulating}
					/>
					<span className="settings-field__unit">days</span>
					<button className="btn btn--secondary" onClick={simulate} disabled={simulating || !simDomain}>
						{simulating ? 'Simulating…' : 'Simulate'}
					</button>
				</div>
				<div className="settings-presets" style={{ marginTop: 8 }}>
					{[1, 3, 7, 14, 30].map((d) => (
						<button key={d} type="button" className={`chip${simDays === d ? ' chip--active' : ''}`} onClick={() => setSimDays(d)} disabled={simulating}>
							{d}d
						</button>
					))}
				</div>
			</div>
		</div>
	);
}