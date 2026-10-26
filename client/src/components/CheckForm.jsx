import React from 'react';
import { certState, StatusBadge } from './StatusBadge.jsx';

const API = '/api/certs';

const SUBJECT_FIELDS = ['C', 'ST', 'L', 'O', 'OU', 'CN'];
const SUGGESTIONS = ['example.com', 'google.com', 'github.com', 'cloudflare.com'];

function formatSubject(subject) {
	if (!subject || typeof subject !== 'object') return '';
	const parts = SUBJECT_FIELDS.filter((f) => subject[f]).map((f) => subject[f]);
	return parts.length ? parts.join(', ') : Object.values(subject).join(', ');
}

export function CheckForm({ onTracked, toast }) {
	const [name, setName] = React.useState('');
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState(null);
	const [cert, setCert] = React.useState(null);

	async function run(host) {
		setLoading(true);
		setError(null);
		setCert(null);
		try {
			const res = await fetch(`${API}?name=${encodeURIComponent(host)}`);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
			setCert(data);
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	}

	function submit(e) {
		e.preventDefault();
		const host = name.trim();
		if (!host) return;
		run(host);
	}

	async function track() {
		try {
			const res = await fetch('/api/tracked', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: cert.name, cert })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
			toast('success', `Now tracking ${cert.name}`);
			onTracked();
		} catch (err) {
			toast('error', `Could not track: ${err.message}`);
		}
	}

	return (
		<div className="panel">
			<div className="panel__head">
				<div>
					<h2 className="panel__title">Certificate Inspector</h2>
					<p className="panel__sub">Resolve any host and inspect its live TLS certificate</p>
				</div>
			</div>

			<form className="form" onSubmit={submit}>
				<div className="form__row">
					<input
						type="text"
						className="field"
						placeholder="example.com"
						value={name}
						onChange={(e) => setName(e.target.value)}
						disabled={loading}
						spellCheck={false}
						autoComplete="off"
					/>
					<button type="submit" className="btn btn--primary" disabled={loading}>
						{loading ? 'Inspecting…' : 'Inspect'}
					</button>
				</div>
				<div className="chips">
					<span className="chips__label">Try:</span>
					{SUGGESTIONS.map((s) => (
						<button key={s} type="button" className="chip" disabled={loading} onClick={() => { setName(s); run(s); }}>
							{s}
						</button>
					))}
				</div>
			</form>

			{error && <div className="form-error">Inspection failed — {error}</div>}

			{cert && (
				<div className="cert">
					<div className="cert__top">
						<div className="cert__host">
							<span className="cert__host-name">{cert.name}</span>
							<StatusBadge state={certState(cert.rt).label} rt={cert.rt} />
						</div>
						<button className="btn btn--secondary" onClick={track}>
							+ Track
						</button>
					</div>
					<dl className="cert__grid">
						<div className="cert__item">
							<dt>Subject</dt>
							<dd>{formatSubject(cert.origin) || '—'}</dd>
						</div>
						<div className="cert__item">
							<dt>Issuer</dt>
							<dd>{formatSubject(cert.issuer) || '—'}</dd>
						</div>
						<div className="cert__item">
							<dt>Valid from</dt>
							<dd className="mono">{cert.from}</dd>
						</div>
						<div className="cert__item">
							<dt>Valid to</dt>
							<dd className="mono">{cert.to}</dd>
						</div>
						<div className="cert__item">
							<dt>Serial</dt>
							<dd className="mono cert__serial">{cert.sn}</dd>
						</div>
						<div className="cert__item">
							<dt>Alt names</dt>
							<dd>{cert.altNames && cert.altNames.length ? cert.altNames.join(', ') : '—'}</dd>
						</div>
					</dl>
				</div>
			)}
		</div>
	);
}