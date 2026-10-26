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

export function TrackedTable({ items, loading, error, onRemove }) {
	if (loading) {
		return (
			<div className="skeleton">
				{[...Array(4)].map((_, i) => (
					<div key={i} className="skeleton__row" />
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="empty">
				<span className="empty__icon">{"\u26A0"}</span>
				<p>Could not load tracked certificates</p>
				<p className="empty__hint">{error}</p>
			</div>
		);
	}

	if (!items.length) {
		return (
			<div className="empty">
				<span className="empty__icon">{"\u{1F510}"}</span>
				<p>No certificates tracked</p>
				<p className="empty__hint">Run an inspection above and press Track to add your first domain.</p>
			</div>
		);
	}

	return (
		<table className="table">
			<thead>
				<tr>
					<th>Domain</th>
					<th>Valid to</th>
					<th className="hide-sm">Status</th>
					<th className="hide-sm">Last checked</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				{items.map((item) => (
					<Row key={item.name} item={item} onRemove={onRemove} />
				))}
			</tbody>
		</table>
	);
}

function Row({ item, onRemove }) {
	const [confirming, setConfirming] = React.useState(false);
	const [removing, setRemoving] = React.useState(false);

	async function remove() {
		if (!confirming) {
			setConfirming(true);
			setTimeout(() => setConfirming((c) => (c ? false : c)), 3000);
			return;
		}
		setConfirming(false);
		setRemoving(true);
		await onRemove(item.name);
		setRemoving(false);
	}

	const state = item.status || 'unknown';

	return (
		<tr>
			<td className="td-domain">{item.name}</td>
			<td className="mono">{item.cert ? item.cert.to : '—'}</td>
			<td className="hide-sm">
				<StatusBadge state={state} rt={item.cert && item.cert.rt} />
			</td>
			<td className="hide-sm muted-cell">{timeAgo(item.lastCheckedAt)}</td>
			<td>
				<button
					className={`btn btn--danger${confirming ? ' btn--danger-confirm' : ''}`}
					onClick={remove}
					disabled={removing}
				>
					{removing ? 'Removing…' : confirming ? 'Confirm?' : 'Remove'}
				</button>
			</td>
		</tr>
	);
}