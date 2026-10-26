import React from 'react';

const PRESETS = {
	scanIntervalMin: [5, 15, 30, 60, 120],
	clientRefreshSec: [10, 30, 60],
	expiryWarnDays: [7, 14, 30, 60]
};

const FIELDS = [
	{ key: 'scanIntervalMin', label: 'Scan interval', unit: 'min', desc: 'How often tracked domains are re-checked automatically' },
	{ key: 'clientRefreshSec', label: 'Dashboard refresh', unit: 'sec', desc: 'How often the browser polls for updates' },
	{ key: 'expiryWarnDays', label: 'Expiry warning', unit: 'days', desc: 'Days before expiry to show a warning status' }
];

const SMTP_FIELDS = [
	{ key: 'smtpHost', label: 'SMTP host', placeholder: 'smtp.gmail.com' },
	{ key: 'smtpPort', label: 'SMTP port', placeholder: '587', type: 'number' },
	{ key: 'smtpUser', label: 'Username', placeholder: 'your-login@brevo.com' },
	{ key: 'smtpPass', label: 'Password', placeholder: '********', type: 'password' },
	{ key: 'smtpFrom', label: 'From address', placeholder: 'alerts@yourdomain.com' },
	{ key: 'alertEmailTo', label: 'Alert recipient', placeholder: 'you@gmail.com' }
];

const TOGGLES = [
	{ key: 'alertOnApproaching', label: 'Alert on approaching', desc: 'Send alerts when a certificate enters the approaching window' },
	{ key: 'alertOnUrgent', label: 'Alert on urgent', desc: 'Send alerts when a certificate enters the urgent window' }
];

const RENEWAL_FIELDS = [
	{ key: 'acmeEmail', label: 'ACME account email', placeholder: 'you@gmail.com' },
	{ key: 'acmeDirectoryUrl', label: 'ACME directory URL', placeholder: 'https://acme-v02.api.letsencrypt.org/directory' },
	{ key: 'acmeDnsToken', label: 'Cloudflare API token', placeholder: 'Zone.DNS edit token', type: 'password' },
	{ key: 'httpsPort', label: 'HTTPS port', placeholder: '8443', type: 'number' }
];

function SectionCard({ icon, title, desc, children }) {
	return (
		<div className="settings-card">
			<div className="settings-card__head">
				<span className="settings-card__icon" aria-hidden="true">{icon}</span>
				<div>
					<h3 className="settings-card__title">{title}</h3>
					{desc ? <p className="settings-card__desc">{desc}</p> : null}
				</div>
			</div>
			<div className="settings-card__body">{children}</div>
		</div>
	);
}

export function SettingsPanel({ open, onClose, toast, onSaved }) {
	const [loading, setLoading] = React.useState(true);
	const [saving, setSaving] = React.useState(false);
	const [values, setValues] = React.useState({});
	const [showPass, setShowPass] = React.useState(false);

	React.useEffect(() => {
		if (!open) return;
		setLoading(true);
		setShowPass(false);
		fetch('/api/settings')
			.then((r) => r.json())
			.then(setValues)
			.catch(() => toast('error', 'Could not load settings'))
			.finally(() => setLoading(false));
	}, [open]);

	React.useEffect(() => {
		if (!open) return;
		function onKey(e) {
			if (e.key === 'Escape') onClose();
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, onClose]);

	function set(key, val) {
		if (typeof val === 'boolean') {
			setValues((v) => ({ ...v, [key]: val }));
			return;
		}
		const numeric = [...SMTP_FIELDS, ...RENEWAL_FIELDS].find((f) => f.key === key && f.type === 'number');
		if (typeof val === 'string' && !Number.isNaN(Number(val)) && numeric) {
			setValues((v) => ({ ...v, [key]: Number(val) }));
			return;
		}
		setValues((v) => ({ ...v, [key]: val }));
	}

	async function save() {
		setSaving(true);
		try {
			const res = await fetch('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(values)
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
			setValues(data);
			toast('success', 'Settings saved');
			onSaved?.();
			onClose();
		} catch (err) {
			toast('error', `Save failed: ${err.message}`);
		} finally {
			setSaving(false);
		}
	}

	if (!open) return null;

	return (
		<div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
			<div className="settings-panel" role="dialog" aria-label="Settings">
				<div className="settings-panel__accent" aria-hidden="true" />
				<div className="settings-panel__head">
					<div>
						<h2 className="panel__title">Settings</h2>
						<p className="panel__sub">Monitoring cadence, notifications and alert channels</p>
					</div>
					<button className="icon-btn" onClick={onClose} aria-label="Close settings">{"\u2715"}</button>
				</div>

				<div className="settings-panel__scroll">
					{loading ? (
						<div className="skeleton">
							{[...Array(6)].map((_, i) => <div key={i} className="skeleton__row" />)}
						</div>
					) : (
						<div className="settings-fields">
							<SectionCard icon={"\u2699\uFE0F"} title="General">
								{FIELDS.map((f) => (
									<div key={f.key} className="settings-field">
										<label className="settings-field__label">{f.label}</label>
										<p className="settings-field__desc">{f.desc}</p>
										<div className="settings-field__row">
											<input
												type="number"
												className="field field--sm"
												value={values[f.key] ?? ''}
												onChange={(e) => set(f.key, e.target.value)}
												disabled={saving}
												min={1}
												max={f.key === 'scanIntervalMin' ? 1440 : f.key === 'clientRefreshSec' ? 300 : 90}
											/>
											<span className="settings-field__unit">{f.unit}</span>
										</div>
										<div className="settings-presets">
											{PRESETS[f.key].map((p) => (
												<button key={p} type="button" className={`chip${values[f.key] === p ? ' chip--active' : ''}`} onClick={() => set(f.key, p)} disabled={saving}>{p}</button>
											))}
										</div>
									</div>
								))}
							</SectionCard>

							<SectionCard icon={"\u2709\uFE0F"} title="SMTP (Email)" desc="Configure outbound email for certificate alerts">
								{SMTP_FIELDS.map((f) => (
									<div key={f.key} className="settings-field">
										<label className="settings-field__label" htmlFor={`smtp-${f.key}`}>{f.label}</label>
										{f.type === 'password' ? (
											<div className="settings-field__row">
												<input
													id={`smtp-${f.key}`}
													type={showPass ? 'text' : 'password'}
													className="field"
													value={values[f.key] ?? ''}
													placeholder={f.placeholder}
													onChange={(e) => set(f.key, e.target.value)}
													disabled={saving}
												/>
												<button
													type="button"
													className="icon-btn icon-btn--sm"
													onClick={() => setShowPass((s) => !s)}
													aria-label={showPass ? 'Hide password' : 'Show password'}
												>
													{showPass ? "\u{1F441}" : "\u{1F440}"}
												</button>
											</div>
										) : (
											<input
												id={`smtp-${f.key}`}
												type={f.type || 'text'}
												className="field"
												value={values[f.key] ?? ''}
												placeholder={f.placeholder}
												onChange={(e) => set(f.key, e.target.value)}
												disabled={saving}
											/>
										)}
									</div>
								))}
							</SectionCard>

							<SectionCard icon={"\u{1F504}"} title="Certificate Renewal" desc="Issuer used by the renewal coordinator when you click Renew">
								<div className="settings-field">
									<label className="settings-field__label" htmlFor="renewal-mode">Renewal mode</label>
									<p className="settings-field__desc">Auto = Let's Encrypt when ACME is configured, otherwise self-signed</p>
									<select
										id="renewal-mode"
										className="field"
										value={values.renewalMode || 'auto'}
										onChange={(e) => set('renewalMode', e.target.value)}
										disabled={saving}
									>
										<option value="auto">Auto (ACME if configured, else self-signed)</option>
										<option value="acme">Let's Encrypt (ACME) only</option>
										<option value="selfsigned">Self-signed only</option>
									</select>
								</div>
								{RENEWAL_FIELDS.map((f) => (
									<div key={f.key} className="settings-field">
										<label className="settings-field__label" htmlFor={`renew-${f.key}`}>{f.label}</label>
										{f.type === 'password' ? (
											<div className="settings-field__row">
												<input
													id={`renew-${f.key}`}
													type={showPass ? 'text' : 'password'}
													className="field"
													value={values[f.key] ?? ''}
													placeholder={f.placeholder}
													onChange={(e) => set(f.key, e.target.value)}
													disabled={saving}
												/>
												<button
													type="button"
													className="icon-btn icon-btn--sm"
													onClick={() => setShowPass((s) => !s)}
													aria-label={showPass ? 'Hide token' : 'Show token'}
												>
													{showPass ? "\u{1F441}" : "\u{1F440}"}
												</button>
											</div>
										) : (
											<input
												id={`renew-${f.key}`}
												type={f.type || 'text'}
												className="field"
												value={values[f.key] ?? ''}
												placeholder={f.placeholder}
												onChange={(e) => set(f.key, e.target.value)}
												disabled={saving}
											/>
										)}
									</div>
								))}
							</SectionCard>

							<SectionCard icon={"\u{1F517}"} title="Webhook" desc="POST JSON to a URL on alert events (Slack, Discord, custom)">
								<div className="settings-field">
									<label className="settings-field__label" htmlFor="webhook-url">Webhook URL</label>
									<input
										id="webhook-url"
										type="url"
										className="field"
										value={values.webhookUrl ?? ''}
										placeholder="https://hooks.slack.com/services/..."
										onChange={(e) => set('webhookUrl', e.target.value)}
										disabled={saving}
									/>
								</div>
							</SectionCard>

							<SectionCard icon={"\u{1F514}"} title="Alert Thresholds" desc="Control which renewal windows trigger notifications">
								{TOGGLES.map((t) => (
									<div key={t.key} className="settings-toggle">
										<div>
											<label className="settings-field__label">{t.label}</label>
											<p className="settings-field__desc">{t.desc}</p>
										</div>
										<button
											type="button"
											className={`toggle ${values[t.key] ? 'toggle--on' : ''}`}
											role="switch"
											aria-checked={!!values[t.key]}
											onClick={() => set(t.key, !values[t.key])}
											disabled={saving}
										>
											<span className="toggle__knob" />
										</button>
									</div>
								))}
							</SectionCard>
						</div>
					)}
				</div>

				<div className="settings-panel__foot">
					<button className="btn btn--secondary" onClick={onClose} disabled={saving}>Cancel</button>
					<button className="btn btn--primary" onClick={save} disabled={saving || loading}>
						{saving ? (
							<>
								<span className="spinner" aria-hidden="true" />
								Saving…
							</>
						) : (
							'Save settings'
						)}
					</button>
				</div>
			</div>
		</div>
	);
}