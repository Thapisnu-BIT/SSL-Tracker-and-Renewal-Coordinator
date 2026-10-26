import React from 'react';

export function Toasts({ toasts }) {
	if (!toasts.length) return null;
	return (
		<div className="toasts" aria-live="polite">
			{toasts.map((t) => (
				<div key={t.id} className={`toast toast--${t.type}`}>
					<span className="toast__icon">{t.type === 'error' ? '\u26A0' : '\u2713'}</span>
					<span>{t.msg}</span>
				</div>
			))}
		</div>
	);
}