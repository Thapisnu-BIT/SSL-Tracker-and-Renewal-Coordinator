import React from 'react';

const STATES = {
	ok: { label: 'ok', cls: 'ok' },
	expiring: { label: 'expiring', cls: 'warn' },
	expired: { label: 'expired', cls: 'bad' },
	unknown: { label: 'no data', cls: 'none' },
	unreachable: { label: 'unreachable', cls: 'bad' }
};

export function certState(rt) {
	if (rt === null || rt === undefined) return STATES.unknown;
	if (rt < 0) return STATES.expired;
	if (rt <= 30) return STATES.expiring;
	return STATES.ok;
}

export function StatusBadge({ state, rt }) {
	const s = STATES[state] || STATES.unknown;
	return (
		<span className={`pill pill--${s.cls}`}>
			<span className="pill__dot" />
			{s.cls === 'ok' || s.cls === 'warn' ? `${s.label} · ${rt}d` : s.label}
		</span>
	);
}