"use client";

import { ArrowLeft, Bell, Check, Clipboard, Info, LoaderCircle, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { financeRequest, FinanceSettings, FinanceSummary } from "../lib/finance-api";

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });

export function DepositView() {
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [amount, setAmount] = useState("");
  const [txid, setTxid] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    Promise.all([financeRequest<FinanceSettings>("settings"), financeRequest<FinanceSummary>("me")]).then(([config, account]) => { setSettings(config); setSummary(account); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load your deposit details."));
  }, []);
  const value = Number(amount);
  const valid = Number.isFinite(value) && value >= (settings?.minimumDeposit ?? 0) && value > 0 && Boolean(txid.trim());
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!valid || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await financeRequest("deposits", "POST", { amount: value, txid: txid.trim() });
      setNotice("Deposit submitted for network confirmation. Your balance will update after admin approval."); setAmount(""); setTxid("");
      setSummary(await financeRequest<FinanceSummary>("me"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit your deposit."); }
    finally { setBusy(false); }
  }
  async function copyAddress() {
    if (!settings?.depositWalletAddress) return;
    try { await navigator.clipboard.writeText(settings.depositWalletAddress); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { setError("Could not access clipboard. Select and copy the wallet address."); }
  }
  const history = summary?.transactions.filter((item) => item.type === "deposit") ?? [];

  return <section className="dash-deposit-page">
    <a className="dash-deposit-back" href="/dashboard?view=wallet"><ArrowLeft size={17} /> Back to wallet</a>
    <div className="dash-page-heading"><div><p className="dash-kicker">WALLET</p><h1>Deposit</h1><p className="dash-subtitle">Send USDT and submit its transaction hash for review.</p></div><a className="dash-page-mobile-notification" href="/dashboard?view=notifications" aria-label="Open notifications"><Bell size={21} /><i /></a></div>
    <div className="dash-deposit-layout"><div className="dash-deposit-main">
      <aside className="dash-deposit-notice"><Info size={20} /><div><strong>Before you send</strong><p>Send only USDT on the exact network below. The deposit is added to your trading balance after the network transfer is checked and approved.</p>{settings?.depositInstructions && <small>{settings.depositInstructions}</small>}</div></aside>
      <form className="dash-panel dash-deposit-panel" onSubmit={submit}>
        <h2 className="dash-deposit-step-title"><span>1</span>Send USDT to this wallet</h2>
        <div className="dash-deposit-address"><div className="dash-deposit-address-icon"><Wallet size={21} /></div><div><small>DEPOSIT WALLET</small><strong>{settings?.depositWalletAddress || "Deposit wallet not configured"}</strong><span>Use only the displayed network.</span></div><button type="button" onClick={copyAddress} disabled={!settings?.depositWalletAddress}><Clipboard size={17} /> {copied ? "Copied" : "Copy"}</button></div>
        <div className="dash-deposit-network"><span><i />Network</span><strong>{settings?.depositNetwork || "Not configured"}</strong></div>
        <div className="dash-deposit-divider" />
        <h2 className="dash-deposit-step-title"><span>2</span>Submit transfer details</h2>
        <label className="dash-deposit-label" htmlFor="deposit-amount">Amount sent</label>
        <div className="dash-deposit-input-wrap"><input id="deposit-amount" type="number" min={settings?.minimumDeposit || "0.01"} step="any" inputMode="decimal" placeholder="Enter amount" value={amount} onChange={(event) => setAmount(event.target.value)} required /><span>USDT</span></div>
        <p className="dash-deposit-helper">Minimum deposit: {money.format(settings?.minimumDeposit ?? 0)} USDT</p>
        <label className="dash-deposit-label dash-deposit-txid" htmlFor="deposit-txid">Transaction hash (TXID)</label>
        <input id="deposit-txid" className="dash-deposit-txid-input" type="text" placeholder="Paste transaction hash" value={txid} onChange={(event) => setTxid(event.target.value)} required />
        {error && <p className="dash-deposit-error" role="alert">{error}</p>}{notice && <p className="dash-deposit-next-hint" role="status">{notice}</p>}
        <button className="dash-deposit-submit" type="submit" disabled={!valid || busy || !settings?.depositWalletAddress}>{busy ? <><LoaderCircle size={17} className="admin-loading-orbit" /> Submitting…</> : "Submit for network confirmation"}</button>
      </form>
      <article className="dash-panel dash-deposit-panel"><div className="dash-panel-heading"><div><h2>Your deposit requests</h2><p>Only approved requests are credited.</p></div></div>{history.length ? history.map((item) => <div className="dash-activity-row" key={item.id}><span className="dash-activity-icon in"><ArrowLeft size={17} /></span><span className="dash-activity-main"><b>{money.format(item.amount)} USDT deposit</b><small>{item.network} · {item.txid || "TXID pending"}</small></span><span className="dash-activity-amount"><b>{item.status.replaceAll("_", " ")}</b><small>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}</small></span></div>) : <p className="dash-deposit-helper">No deposit requests yet.</p>}</article>
    </div><aside className="dash-panel dash-deposit-status"><span className="dash-overline">DEPOSIT STATUS</span><h2>What happens next?</h2><div className="dash-deposit-timeline"><div className="current"><i><Check size={13} /></i><span><strong>Submit transfer</strong><small>Send using the configured wallet and network.</small></span></div><div><i>2</i><span><strong>Network confirmation</strong><small>An admin checks your transfer and TXID.</small></span></div><div><i>3</i><span><strong>Approved and credited</strong><small>Your trading balance updates after approval.</small></span></div></div></aside></div>
  </section>;
}
