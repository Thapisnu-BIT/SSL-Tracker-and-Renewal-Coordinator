import React from 'react';
import { CheckForm } from './components/CheckForm.jsx';
import { TrackedTable } from './components/TrackedTable.jsx';
import { ScanPanel } from './components/ScanPanel.jsx';
import { RenewalPanel } from './components/RenewalPanel.jsx';
import { AlertPanel } from './components/AlertPanel.jsx';
import { SettingsPanel } from './components/SettingsPanel.jsx';
import { Toasts } from './components/Toasts.jsx';

const TRACKED_API = '/api/tracked';
const SETTINGS_API = '/api/settings';

function Brand({ apiOnline, onSettingsOpen }) {
	return (
		<header className="topbar">
			<div className="brand">
				<span className="brand__mark">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<rect x="3" y="11" width="18" height="11" rx="2" />
						<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
				</span>
				<span className="brand__name">SSL Tracker</span>
				<span className="brand__tag">Certificate lifecycle management</span>
			</div>
			<div className="topbar__right">
				<button className="icon-btn" onClick={onSettingsOpen} title="Settings">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
					</svg>
				</button>
				<span className={`api-pill ${apiOnline ? 'api-pill--on' : 'api-pill--off'}`}>
					<span className="api-pill__dot" />
					{apiOnline ? 'API connected' : 'API offline'}
				</span>
			</div>
		</header>
	);
}

function App() {
	const [tracked, setTracked] = React.useState([]);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState(null);
	const [toasts, setToasts] = React.useState([]);
	const [apiOnline, setApiOnline] = React.useState(false);
	const [settingsOpen, setSettingsOpen] = React.useState(false);
	const [refreshSec, setRefreshSec] = React.useState(30);

	function toast(type, msg) {
		const id = Date.now() + Math.random();
		setToasts((t) => [...t, { id, type, msg }]);
		setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
	}

	function loadTracked() {
		setLoading(true);
		setError(null);
		fetch(TRACKED_API)
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((data) => {
				setApiOnline(true);
				setTracked(data);
			})
			.catch((err) => {
				setApiOnline(false);
				setError(err.message);
			})
			.finally(() => setLoading(false));
	}

	function loadSettings() {
		fetch(SETTINGS_API)
			.then((r) => r.json())
			.then((s) => setRefreshSec(s.clientRefreshSec))
			.catch(() => {});
	}

	React.useEffect(() => {
		loadTracked();
		loadSettings();
	}, []);

	React.useEffect(() => {
		const timer = setInterval(loadTracked, refreshSec * 1000);
		return () => clearInterval(timer);
	}, [refreshSec]);

	async function removeDomain(name) {
		const res = await fetch(`${TRACKED_API}/${encodeURIComponent(name)}`, { method: 'DELETE' });
		if (res.ok) {
			setTracked((t) => t.filter((x) => x.name !== name));
			toast('success', `Removed ${name}`);
		} else {
			const data = await res.json().catch(() => ({}));
			toast('error', `Could not remove: ${data.error || `HTTP ${res.status}`}`);
			loadTracked();
		}
	}

	return (
		<div className="app">
			<Brand apiOnline={apiOnline} onSettingsOpen={() => setSettingsOpen(true)} />
			<Toasts toasts={toasts} />
			<SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} toast={toast} onSaved={loadSettings} />
			<main className="layout">
				<CheckForm onTracked={loadTracked} toast={toast} />
				<div className="panel">
					<div className="panel__head">
						<div>
							<h2 className="panel__title">Tracked Certificates</h2>
							<p className="panel__sub">Stored in Cloud — refreshed every {refreshSec}s</p>
						</div>
						<span className="count-pill">{tracked.length} tracked</span>
					</div>
					<TrackedTable items={tracked} loading={loading} error={error} onRemove={removeDomain} />
				</div>
				<ScanPanel onScanComplete={loadTracked} toast={toast} />
			<RenewalPanel toast={toast} />
			<AlertPanel toast={toast} />
			</main>
		</div>
	);
}

export default App;
