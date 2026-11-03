"use client";

import { Fingerprint, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { withdrawalSecurityApi, WithdrawalSecurityStatus } from '../lib/withdrawal-security-api';

export function WithdrawalSecurityPrompt({ onComplete }: { onComplete: (status: WithdrawalSecurityStatus) => void }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function savePin(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { onComplete(await withdrawalSecurityApi.setPin(pin)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your PIN.'); }
    finally { setBusy(false); }
  }
  async function registerPasskey() {
    setBusy(true); setError('');
    try { onComplete(await withdrawalSecurityApi.registerPasskey()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Device verification could not be enabled.'); }
    finally { setBusy(false); }
  }
  return <div className="dash-modal-layer dash-security-required" role="presentation"><section className="dash-modal-card dash-withdraw-security-card" role="dialog" aria-modal="true" aria-labelledby="withdraw-security-title">
    <header><span className="dash-modal-icon"><ShieldCheck size={20}/></span></header><h2 id="withdraw-security-title">Secure your withdrawals</h2><p>Choose a six-digit PIN or enable this device’s fingerprint or face unlock. You can add both later in account security.</p>
    <button type="button" className="dash-security-biometric" disabled={busy} onClick={() => void registerPasskey()}><Fingerprint size={19}/><span><strong>Enable fingerprint / Face ID</strong><small>Verify securely on this device</small></span>{busy ? <LoaderCircle size={17} className="admin-loading-orbit"/> : null}</button>
    <div className="dash-security-divider"><span>or set a PIN</span></div>
    <form onSubmit={(event) => void savePin(event)}><label className="dash-deposit-label" htmlFor="first-withdrawal-pin">6-digit withdrawal PIN</label><input id="first-withdrawal-pin" className="dash-security-pin-input" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 6 digits" required/><button className="dash-modal-primary dash-security-save" type="submit" disabled={busy || pin.length !== 6}>{busy ? <LoaderCircle size={17} className="admin-loading-orbit"/> : <KeyRound size={17}/>} Set withdrawal PIN</button></form>
    {error && <p className="dash-withdraw-inline-error" role="alert">{error}</p>}<p className="dash-security-privacy">Your PIN is stored as a secure hash. Device biometrics remain on your device.</p>
  </section></div>;
}
