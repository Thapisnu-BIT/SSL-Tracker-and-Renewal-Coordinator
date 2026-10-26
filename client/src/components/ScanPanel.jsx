import React from 'react';
import { certState, StatusBadge } from './StatusBadge.jsx';

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

function formatDuration(ms) {
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export function ScanPanel({ onScanComplete, toast }) {
	const [scanning, setScanning] = React.useState(false);
	const [logs, setLogs] = React.useState([]);
	const [loadingLogs, setLoadingLogs] = React.useState(true);

	function loadLogs() {
		setLoadingLogs(true);
		fetch('/api/scan-log')
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then(setLogs)
			.catch(() => setLogs([]))
			.finally(() => setLoadingLogs(false));
	}

	React.useEffect(loadLogs, []);

	async function runScan() {
		setScanning(true);
		try {
			const res = await fetch('/api/scan', { method: 'POST' });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
			toast(
				'success',
				`Scan complete: ${data.scanned} scanned, ${data.ok} ok, ${data.warn} warn, ${data.expired} expired, ${data.unreachable} unreachable`
			);
			loadLogs();
			onScanComplete && onScanComplete();
		} catch (err) {
			toast('error', `Scan failed: ${err.message}`);
		} finally {
			setScanning(false);
		}
	}

	return (
		<div className="panel">
			<div className="panel__head">
				<div>
					<h2 className="panel__title">Recent Scans</h2>
					<p className="panel__sub">Automatic scan runs per configured — or trigger manually below</p>
				</div>
				<button className="btn btn--secondary" onClick={runScan} disabled={scanning}>
					{scanning ? 'Scanning…' : 'Run scan now'}
				</button>
			</div>

			{loadingLogs ? (
				<div className="skeleton">
					{[...Array(3)].map((_, i) => (
						<div key={i} className="skeleton__row" />
					))}
				</div>
			) : logs.length === 0 ? (
				<div className="empty">
					<span className="empty__icon">{"\u23F1"}</span>
					<p>No scans yet</p>
					<p className="empty__hint">Press "Run scan now" or wait for the scheduled scan to run.</p>
				</div>
			) : (
				<table className="table">
					<thead>
						<tr>
							<th>Time</th>
							<th>Duration</th>
							<th className="hide-sm">Scanned</th>
							<th className="hide-sm">OK</th>
							<th className="hide-sm">Warn</th>
							<th className="hide-sm">Expired</th>
							<th className="hide-sm">Unreachable</th>
						</tr>
					</thead>
					<tbody>
						{logs.map((log) => (
							<tr key={log._id}>
								<td>{timeAgo(log.startedAt)}</td>
								<td className="mono">{formatDuration(log.duration)}</td>
								<td className="hide-sm">{log.scanned}</td>
								<td className="hide-sm">
									<span className="pill pill--ok">{log.ok}</span>
								</td>
								<td className="hide-sm">
									<span className="pill pill--warn">{log.warn}</span>
								</td>
								<td className="hide-sm">
									<span className="pill pill--bad">{log.expired}</span>
								</td>
								<td className="hide-sm">
									<span className="pill pill--none">{log.unreachable}</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}
