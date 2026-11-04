"use client";

import { ArrowLeft, ArrowRight, Check, Clipboard, Info, LoaderCircle, Wallet, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { financeRequest, financeStatusLabel, financeStatusTone, FinanceSettings, FinanceSummary } from "../lib/finance-api";
import { TradeDashboard, tradeRequest } from "../lib/trading-api";
import { NotificationBell } from "./NotificationCenter";
import { withdrawalScheduleLabel, withdrawalWindowOpen } from "../lib/withdrawal-schedule";
import { withdrawalSecurityApi, WithdrawalSecurityStatus } from "../lib/withdrawal-security-api";
import { Fingerprint, KeyRound, ShieldCheck } from "lucide-react";
import { AuthSuccess } from "./AuthSuccess";

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });

export function WithdrawalView() {
  const [wallet, setWallet] = useState<"trading" | "referral" | "profit">(() => { if (typeof window === "undefined") return "referral"; const selected = new URLSearchParams(window.location.search).get("wallet"); return selected === "trading" || selected === "profit" ? selected : "referral"; });
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pasteMessage, setPasteMessage] = useState("");
  const [scheduleTime, setScheduleTime] = useState(() => new Date());
  const [tradeDashboard, setTradeDashboard] = useState<TradeDashboard | null>(null);
  const [security, setSecurity] = useState<WithdrawalSecurityStatus | null>(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationPin, setVerificationPin] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [verificationMethod, setVerificationMethod] = useState<"pin" | "biometric" | null>(null);
  const [withdrawalSuccess, setWithdrawalSuccess] = useState<number | null>(null);
  useEffect(() => { withdrawalSecurityApi.status().then(setSecurity).catch(() => setSecurity(null)); }, []);
  useEffect(() => { Promise.all([financeRequest<FinanceSummary>("me"), financeRequest<FinanceSettings>("settings")]).then(([account, config]) => { setSummary(account); setSettings(config); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load withdrawal details.")); }, []);
  useEffect(() => { const refresh = () => financeRequest<FinanceSummary>("me").then(setSummary).catch(() => undefined); const timer = window.setInterval(refresh, 15000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const refresh = () => tradeRequest<TradeDashboard>("me").then(setTradeDashboard).catch(() => undefined); void refresh(); const timer = window.setInterval(refresh, 15000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const timer = window.setInterval(() => setScheduleTime(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (wallet === "profit") requestAnimationFrame(() => document.getElementById("profit-withdraw-section")?.scrollIntoView({ behavior: "smooth", block: "start" })); }, [wallet]);
  const available = wallet === "trading" ? summary?.balances.availableMaturedPrincipal ?? 0 : wallet === "referral" ? summary?.balances.availableReferral ?? 0 : summary?.balances.availableProfit ?? 0;
  const numericAmount = Number(amount);
  const withdrawalFee = Math.round((numericAmount * (settings?.withdrawalFeePercent ?? 0) / 100 + (settings?.withdrawalFeeFixed ?? 0)) * 1e8) / 1e8;
  const payoutAmount = Math.max(0, Math.round((numericAmount - withdrawalFee) * 1e8) / 1e8);
  const withinWithdrawalWindow = withdrawalWindowOpen(settings, scheduleTime);
  const activeTrades = tradeDashboard?.positions.filter((position) => position.status === "active") ?? [];
  const validAmount = Number.isFinite(numericAmount) && numericAmount >= (settings?.minimumWithdrawal ?? 0) && numericAmount > 0 && numericAmount <= available && payoutAmount > 0 && withinWithdrawalWindow && (wallet !== "profit" || activeTrades.length === 0);
  const history = useMemo(() => summary?.transactions.filter((item) => item.type === "withdrawal") ?? [], [summary]);
  const latest = history[0];
  const state = latest?.status ?? "new";
  const stepOne = state !== "new";
  const stepTwo = state === "pending_review" || state === "approved" || state === "rejected";
  const rejected = state === "rejected";
  const approved = state === "approved";
  async function pasteAddress() {
    setPasteMessage("");
    try { const value = await navigator.clipboard.readText(); if (value) setAddress(value.trim()); else setPasteMessage("Your clipboard is empty."); }
    catch { setPasteMessage("Paste the address into the field above."); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!validAmount || !address.trim() || !settings?.depositNetwork || busy) return;
    if (!security?.configured) { setError("Set a withdrawal PIN or enable device biometrics before making a withdrawal."); return; }
    setError(""); setNotice(""); setVerificationError(""); setVerificationPin(""); setVerificationMethod(null); setVerificationOpen(true);
  }
  async function submitVerified(verification: { pin?: string; verificationToken?: string }) {
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = { amount: numericAmount, destinationAddress: address.trim(), network: settings!.depositNetwork, ...verification };
      if (wallet === "profit") await tradeRequest("withdraw-profit", "POST", payload);
      else await financeRequest("withdrawals", "POST", { ...payload, balanceType: wallet });
      setVerificationOpen(false);
      setWithdrawalSuccess(payoutAmount); setAddress(""); setAmount("");
      void financeRequest<FinanceSummary>("me").then(setSummary).catch(() => undefined);
      if (wallet === "profit") void tradeRequest<TradeDashboard>("me").then(setTradeDashboard).catch(() => undefined);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not submit your withdrawal.";
      setVerificationError(message);
      if (wallet === "profit") {
        const [freshSummary, freshTrades] = await Promise.all([
          financeRequest<FinanceSummary>("me").catch(() => null),
          tradeRequest<TradeDashboard>("me").catch(() => null),
        ]);
        if (freshSummary) setSummary(freshSummary);
        if (freshTrades) setTradeDashboard(freshTrades);
      }
    }
    finally { setBusy(false); }
  }
  async function verifyWithPin(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); await submitVerified({ pin: verificationPin }); }
  async function verifyWithBiometrics() {
    setBusy(true); setVerificationError("");
    try {
      const result = await withdrawalSecurityApi.verifyPasskey({ amount: numericAmount, destinationAddress: address.trim(), network: settings!.depositNetwork, source: wallet === "profit" ? "profit" : wallet });
      await submitVerified({ verificationToken: result.verificationToken });
    } catch (cause) { setVerificationError(cause instanceof Error ? cause.message : "Device verification failed."); setBusy(false); }
  }

  if (withdrawalSuccess !== null) return <AuthSuccess pageClassName="dash-withdraw-success-page" title="Withdrawal request submitted!" description={`${money.format(withdrawalSuccess)} USD is now awaiting review. You can follow its progress from the withdrawal status page.`} action="View withdrawal status" onContinue={() => { setWithdrawalSuccess(null); window.setTimeout(() => document.getElementById("withdrawal-status-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }} />;

  return <section className="dash-withdraw-page">
    <a className="dash-deposit-back" href="/dashboard?view=wallet"><ArrowLeft size={17} /> Back to wallet</a>
    <div className="dash-page-heading"><div><p className="dash-kicker">WALLET</p><h1>Withdraw</h1><p className="dash-subtitle">Choose matured investment principal, referral funds, or trade profit.</p></div><NotificationBell className="dash-page-mobile-notification" size={21} /></div>
    <div className="dash-withdraw-grid"><div className="dash-withdraw-main">
      <aside className="dash-deposit-notice"><Info size={20} /><div><strong>Account withdrawal policy</strong><p>Withdrawal requests for investment principal, referral funds, and trade profit are accepted only during the account-wide schedule. Deposited or trade-returned capital follows the {settings?.capitalLockDays ?? 60}-day lockup before it becomes withdrawable. Locked main-balance funds remain usable to join trades.</p><small>{settings ? withdrawalScheduleLabel(settings) : "Loading withdrawal schedule..."} | Network: {settings?.depositNetwork || "Not configured"} | Minimum: {money.format(settings?.minimumWithdrawal ?? 0)} USD</small></div></aside>
      <div className="dash-panel dash-withdraw-wallet-select"><label htmlFor="withdraw-wallet">Withdraw from<select id="withdraw-wallet" value={wallet} onChange={(event) => { setWallet(event.target.value as "trading" | "referral" | "profit"); setAmount(""); }}><option value="trading">Matured investment principal</option><option value="referral">Referral wallet</option><option value="profit">Total profit earned</option></select></label></div>
      <form id={wallet === "profit" ? "profit-withdraw-section" : undefined} className="dash-panel dash-withdraw-panel" onSubmit={submit}>
        <div className="dash-withdraw-balance"><span><Wallet size={19} /> {wallet === "trading" ? "Matured principal available" : wallet === "profit" ? "Available profit" : "Referral balance available"}</span><strong>{money.format(available)} USD</strong></div>
        {wallet === "profit" && activeTrades.length > 0 && <div className="dash-profit-blocked" role="status"><strong>Stop your active trade before withdrawing profit</strong><span>You have {activeTrades.length} open {activeTrades.length === 1 ? "trade" : "trades"}. Stop each one, then return here to request a withdrawal.</span><a href="/dashboard?view=trading">Manage active trades <ArrowRight size={15} /></a></div>}{wallet === "profit" && !withinWithdrawalWindow && <p className="dash-withdraw-inline-note">Profit withdrawals open {settings ? withdrawalScheduleLabel(settings) : "during the configured account withdrawal window"}.</p>}{wallet === "profit" && tradeDashboard && (summary?.balances.availableProfit ?? 0) <= 0 && <p className="dash-withdraw-inline-note">No closed-trade profit is currently available to withdraw.</p>}{wallet === "profit" && !tradeDashboard && <p className="dash-deposit-helper">Loading trade profit details...</p>}
        <h2 className="dash-deposit-step-title"><span>1</span>Destination wallet</h2><label className="dash-deposit-label" htmlFor="withdraw-address">USDT wallet address</label>
        <div className="dash-withdraw-address-row"><input id="withdraw-address" type="text" autoComplete="off" spellCheck={false} placeholder="Paste the destination wallet address" value={address} onChange={(event) => setAddress(event.target.value)} required /><button type="button" onClick={pasteAddress}><Clipboard size={16} /> Paste</button></div>
        {pasteMessage && <p className="dash-withdraw-inline-note" role="status">{pasteMessage}</p>}
        <div className="dash-withdraw-progress-step"><h2 className="dash-deposit-step-title"><span>2</span>Withdrawal amount</h2><label className="dash-deposit-label" htmlFor="withdraw-amount">Amount to debit</label><div className="dash-deposit-input-wrap"><input id="withdraw-amount" type="number" min={settings?.minimumWithdrawal || "0.01"} max={available} step="any" inputMode="decimal" placeholder="Enter amount" value={amount} onChange={(event) => setAmount(event.target.value)} required /><span>USD</span><button type="button" onClick={() => setAmount(String(available))}>Max</button></div><p className="dash-deposit-helper">Available: {money.format(available)} USD | Minimum: {money.format(settings?.minimumWithdrawal ?? 0)} USD</p>{amount && <div className="dash-withdraw-review dash-withdraw-fee-breakdown"><div><span>Withdrawal charge</span><strong>{money.format(withdrawalFee)} USD</strong></div><div><span>You will receive</span><strong>{money.format(payoutAmount)} USD</strong></div></div>}{amount && !validAmount && <p className="dash-withdraw-inline-error" role="alert">Check the minimum, available balance, charge amount, and account withdrawal window.</p>}{!withinWithdrawalWindow && <p className="dash-withdraw-inline-note">Requests open {settings ? withdrawalScheduleLabel(settings) : "during the configured withdrawal window"}.</p>}</div>
        <div className="dash-withdraw-progress-step"><h2 className="dash-deposit-step-title"><span>3</span>Review request</h2><div className="dash-withdraw-review"><div><span>From</span><strong>{wallet === "trading" ? "Matured investment principal" : wallet === "profit" ? "Total profit earned" : "Referral wallet"}</strong></div><div><span>Balance debit</span><strong>{money.format(numericAmount || 0)} USD</strong></div><div><span>Charge</span><strong>{money.format(withdrawalFee)} USD</strong></div><div><span>You receive</span><strong>{money.format(payoutAmount)} USD</strong></div><div><span>Network</span><strong>{settings?.depositNetwork || "Not configured"}</strong></div><div><span>Destination</span><strong>{address || "Enter wallet address"}</strong></div></div></div>
        {error && <p className="dash-deposit-error" role="alert">{error}</p>}{notice && <p className="dash-deposit-next-hint" role="status">{notice}</p>}
        <button className="dash-withdraw-review-button" type="submit" disabled={!validAmount || !address.trim() || !settings?.depositNetwork || busy || !security?.configured}>{busy ? <><LoaderCircle size={17} /> Submitting...</> : "Verify & submit withdrawal"}</button>
      </form>
      <article className="dash-panel dash-withdraw-panel"><div className="dash-panel-heading"><div><h2>Your withdrawal requests</h2><p>Approved referral, matured principal, and trade profit withdrawals are recorded here.</p></div></div>{history.length ? history.map((item) => <div className="dash-activity-row" key={item.id}><span className="dash-activity-icon out"><ArrowLeft size={17} /></span><span className="dash-activity-main"><b>{money.format(item.amount)} USD withdrawal</b><small>{item.sourceType === "trade_interest" ? "Trade profit" : item.maturedPrincipalWithdrawal ? "Matured principal" : `${item.balanceType} balance`} | {item.network}</small></span><span className="dash-activity-amount"><b className={`dash-status-label ${financeStatusTone(item.status)}`}>{financeStatusLabel(item.status)}</b><small>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}</small></span></div>) : <p className="dash-deposit-helper">No withdrawal requests yet.</p>}</article>
    </div><aside id="withdrawal-status-section" className="dash-panel dash-deposit-status"><span className="dash-overline">WITHDRAWAL STATUS</span><h2>{latest ? "Latest request progress" : "Request steps"}</h2><div className="dash-deposit-timeline"><div className={stepOne ? "completed" : "current"}><i>{stepOne ? <Check size={13} /> : "1"}</i><span><strong>Submit details</strong><small>Verify the wallet and chosen balance.</small></span></div><div className={`${stepTwo ? "completed" : ""} ${state === "pending_review" ? "current" : ""}`}><i>{stepTwo ? <Check size={13} /> : "2"}</i><span><strong>Request review</strong><small>{state === "pending_review" ? "Your request is being reviewed." : "Funds remain reserved during review."}</small></span></div><div className={`${approved ? "completed current" : ""} ${rejected ? "failed" : ""}`}><i>{rejected ? <X size={13} /> : approved ? <Check size={13} /> : "3"}</i><span><strong>{rejected ? "Withdrawal rejected" : approved ? "Withdrawal approved" : "Approved or rejected"}</strong><small>{rejected ? latest?.rejectionReason || "Reserved funds have been released." : approved ? "Your selected balance has been debited." : "Approval debits funds; rejection releases them."}</small></span></div></div></aside></div>
    {verificationOpen && typeof document !== "undefined" && createPortal(<div className="dash-modal-layer" role="presentation"><section className="dash-modal-card dash-withdraw-verify-card" role="dialog" aria-modal="true" aria-labelledby="withdraw-verify-title"><header><span className="dash-modal-icon"><ShieldCheck size={20}/></span><button type="button" aria-label="Close verification" onClick={() => setVerificationOpen(false)}><X size={18}/></button></header><h2 id="withdraw-verify-title">Verify this withdrawal</h2><p>Debit {money.format(numericAmount)} USD, charge {money.format(withdrawalFee)} USD, send {money.format(payoutAmount)} USD to {address.trim()}.</p>
      <div className="dash-withdraw-method-options">
        {security?.pinEnabled && verificationMethod !== "pin" && <button type="button" className="dash-security-biometric" disabled={busy} onClick={() => { setVerificationMethod("pin"); setVerificationError(""); }}><KeyRound size={19}/><span><strong>Use withdrawal PIN</strong><small>Enter your six-digit PIN</small></span><ArrowRight size={16}/></button>}
        {security?.biometricEnabled && <button type="button" className="dash-security-biometric" disabled={busy} onClick={() => void verifyWithBiometrics()}><Fingerprint size={19}/><span><strong>{security.biometricEnabled && security.pinEnabled ? "Use fingerprint / Face ID" : "Verify with fingerprint / Face ID"}</strong><small>Confirm securely on this device</small></span>{busy ? <LoaderCircle size={17} className="admin-loading-orbit"/> : <ArrowRight size={16}/>}</button>}
      </div>
      {security?.pinEnabled && verificationMethod === "pin" && <form className="dash-withdraw-pin-form" onSubmit={(event) => void verifyWithPin(event)}><label className="dash-deposit-label" htmlFor="withdraw-verification-pin">6-digit withdrawal PIN</label><input id="withdraw-verification-pin" className="dash-security-pin-input" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6}" maxLength={6} value={verificationPin} onChange={(event) => setVerificationPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter your PIN" required autoFocus/><button className="dash-modal-primary dash-security-save" type="submit" disabled={busy || verificationPin.length !== 6}>{busy ? <LoaderCircle size={17} className="admin-loading-orbit"/> : <KeyRound size={17}/>} Verify &amp; submit</button></form>}
      {verificationError && <p className="dash-withdraw-inline-error" role="alert">{verificationError}</p>}<footer><button type="button" className="dash-modal-secondary" onClick={() => setVerificationOpen(false)}>Cancel</button></footer></section></div>, document.body)}
  </section>;
}
