"use client";

import { ArrowLeft, Check, Clipboard, Info, LoaderCircle, Wallet, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { financeRequest, financeStatusLabel, financeStatusTone, FinanceSettings, FinanceSummary } from "../lib/finance-api";
import { NotificationBell } from "./NotificationCenter";

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });

export function WithdrawalView() {
  const [wallet, setWallet] = useState<"trading" | "referral">("trading");
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pasteMessage, setPasteMessage] = useState("");
  useEffect(() => { Promise.all([financeRequest<FinanceSummary>("me"), financeRequest<FinanceSettings>("settings")]).then(([account, config]) => { setSummary(account); setSettings(config); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load withdrawal details.")); }, []);
  useEffect(() => { const refresh = () => financeRequest<FinanceSummary>("me").then(setSummary).catch(() => undefined); const timer = window.setInterval(refresh, 15000); return () => window.clearInterval(timer); }, []);
  const available = wallet === "trading" ? summary?.balances.availableTrading ?? 0 : summary?.balances.availableReferral ?? 0;
  const numericAmount = Number(amount);
  const validAmount = Number.isFinite(numericAmount) && numericAmount >= (settings?.minimumWithdrawal ?? 0) && numericAmount > 0 && numericAmount <= available;
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
    setBusy(true); setError(""); setNotice("");
    try {
      await financeRequest("withdrawals", "POST", { amount: numericAmount, balanceType: wallet, destinationAddress: address.trim(), network: settings.depositNetwork });
      setNotice("Withdrawal request submitted. The amount is reserved while admin reviews it."); setAddress(""); setAmount("");
      setSummary(await financeRequest<FinanceSummary>("me"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit your withdrawal."); }
    finally { setBusy(false); }
  }

  return <section className="dash-withdraw-page">
    <a className="dash-deposit-back" href="/dashboard?view=wallet"><ArrowLeft size={17} /> Back to wallet</a>
    <div className="dash-page-heading"><div><p className="dash-kicker">WALLET</p><h1>Withdraw</h1><p className="dash-subtitle">Request a payout from the balance you choose.</p></div><NotificationBell className="dash-page-mobile-notification" size={21} /></div>
    <div className="dash-withdraw-grid"><div className="dash-withdraw-main">
      <aside className="dash-deposit-notice"><Info size={20} /><div><strong>Withdrawal review</strong><p>Requests are reviewed by the EchoVest team. Your selected funds are reserved until the request is approved or rejected.</p><small>Network: {settings?.depositNetwork || "Not configured"} · Minimum: {money.format(settings?.minimumWithdrawal ?? 0)} USDT</small></div></aside>
      <form className="dash-panel dash-withdraw-panel" onSubmit={submit}>
        <div className="dash-withdraw-balance"><span><Wallet size={19} /> Available to withdraw</span><strong>{money.format(available)} USDT</strong><label htmlFor="withdraw-wallet">Withdraw from</label><select id="withdraw-wallet" value={wallet} onChange={(event) => { setWallet(event.target.value as "trading" | "referral"); setAmount(""); }}><option value="trading">Investment balance</option><option value="referral">Referral balance</option></select></div>
        <h2 className="dash-deposit-step-title"><span>1</span>Destination wallet</h2><label className="dash-deposit-label" htmlFor="withdraw-address">USDT wallet address</label>
        <div className="dash-withdraw-address-row"><input id="withdraw-address" type="text" autoComplete="off" spellCheck={false} placeholder="Paste the destination wallet address" value={address} onChange={(event) => setAddress(event.target.value)} required /><button type="button" onClick={pasteAddress}><Clipboard size={16} /> Paste</button></div>
        {pasteMessage && <p className="dash-withdraw-inline-note" role="status">{pasteMessage}</p>}
        <div className="dash-withdraw-progress-step"><h2 className="dash-deposit-step-title"><span>2</span>Withdrawal amount</h2><label className="dash-deposit-label" htmlFor="withdraw-amount">Amount</label><div className="dash-deposit-input-wrap"><input id="withdraw-amount" type="number" min={settings?.minimumWithdrawal || "0.01"} max={available} step="any" inputMode="decimal" placeholder="Enter amount" value={amount} onChange={(event) => setAmount(event.target.value)} required /><span>USDT</span><button type="button" onClick={() => setAmount(String(available))}>Max</button></div><p className="dash-deposit-helper">Available: {money.format(available)} USDT · Minimum: {money.format(settings?.minimumWithdrawal ?? 0)} USDT</p>{amount && !validAmount && <p className="dash-withdraw-inline-error" role="alert">Amount must meet the minimum and not exceed your available balance.</p>}</div>
        <div className="dash-withdraw-progress-step"><h2 className="dash-deposit-step-title"><span>3</span>Review request</h2><div className="dash-withdraw-review"><div><span>From</span><strong>{wallet === "trading" ? "Investment balance" : "Referral balance"}</strong></div><div><span>Amount</span><strong>{money.format(numericAmount || 0)} USDT</strong></div><div><span>Network</span><strong>{settings?.depositNetwork || "Not configured"}</strong></div><div><span>Destination</span><strong>{address || "Enter wallet address"}</strong></div></div></div>
        {error && <p className="dash-deposit-error" role="alert">{error}</p>}{notice && <p className="dash-deposit-next-hint" role="status">{notice}</p>}
        <button className="dash-withdraw-review-button" type="submit" disabled={!validAmount || !address.trim() || !settings?.depositNetwork || busy}>{busy ? <><LoaderCircle size={17} /> Submitting…</> : "Submit withdrawal request"}</button>
      </form>
      <article className="dash-panel dash-withdraw-panel"><div className="dash-panel-heading"><div><h2>Your withdrawal requests</h2><p>Approved withdrawals are deducted from the selected balance.</p></div></div>{history.length ? history.map((item) => <div className="dash-activity-row" key={item.id}><span className="dash-activity-icon out"><ArrowLeft size={17} /></span><span className="dash-activity-main"><b>{money.format(item.amount)} USDT withdrawal</b><small>{item.balanceType} balance · {item.network}</small></span><span className="dash-activity-amount"><b className={`dash-status-label ${financeStatusTone(item.status)}`}>{financeStatusLabel(item.status)}</b><small>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}</small></span></div>) : <p className="dash-deposit-helper">No withdrawal requests yet.</p>}</article>
    </div><aside className="dash-panel dash-deposit-status"><span className="dash-overline">WITHDRAWAL STATUS</span><h2>{latest ? "Latest request progress" : "Request steps"}</h2><div className="dash-deposit-timeline"><div className={stepOne ? "completed" : "current"}><i>{stepOne ? <Check size={13} /> : "1"}</i><span><strong>Submit details</strong><small>Verify the wallet and chosen balance.</small></span></div><div className={`${stepTwo ? "completed" : ""} ${state === "pending_review" ? "current" : ""}`}><i>{stepTwo ? <Check size={13} /> : "2"}</i><span><strong>Admin review</strong><small>{state === "pending_review" ? "Your request is being reviewed." : "Funds remain reserved during review."}</small></span></div><div className={`${approved ? "completed current" : ""} ${rejected ? "failed" : ""}`}><i>{rejected ? <X size={13} /> : approved ? <Check size={13} /> : "3"}</i><span><strong>{rejected ? "Withdrawal rejected" : approved ? "Withdrawal approved" : "Approved or rejected"}</strong><small>{rejected ? latest?.rejectionReason || "Reserved funds have been released." : approved ? "Your selected balance has been debited." : "Approval debits funds; rejection releases them."}</small></span></div></div></aside></div>
  </section>;
}
