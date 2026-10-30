"use client";

import { ArrowLeft, ArrowRight, Bell, Check, Clipboard, Info, LockKeyhole, ShieldCheck, Wallet, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const balances = { trading: 12160.5, referral: 320 };
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function WithdrawalView() {
  const [wallet, setWallet] = useState<"trading" | "referral">("trading");
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [previewNotice, setPreviewNotice] = useState(false);
  const [pasteMessage, setPasteMessage] = useState("");
  const available = balances[wallet];
  const numericAmount = Number(amount);
  const validAmount = Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount <= available;

  useEffect(() => {
    if (!modalOpen) return;
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") setModalOpen(false); }
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); };
  }, [modalOpen]);

  async function pasteAddress() {
    setPasteMessage("");
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText) setAddress(clipboardText.trim());
      else setPasteMessage("Your clipboard is empty.");
    } catch { setPasteMessage("Paste the address into the field above."); }
  }

  return <>
  <section className="dash-withdraw-page">
    <a className="dash-deposit-back" href="/dashboard?view=wallet"><ArrowLeft size={17} /> Back to wallet</a>
    <div className="dash-page-heading"><div><p className="dash-kicker">WALLET</p><h1>Withdraw</h1><p className="dash-subtitle">Send funds to a wallet you control.</p></div><span className="dash-preview-tag"><i /> Preview only</span><a className="dash-page-mobile-notification" href="/dashboard?view=notifications" aria-label="Open notifications"><Bell size={21} /><i /></a></div>
    <div className="dash-withdraw-grid">
      <div className="dash-withdraw-main">
        <aside className="dash-deposit-notice"><Info size={20} /><div><strong>Withdrawal processing</strong><p>Withdrawal requests are expected to be processed within 1–24 hours. You can follow each request in your transaction history.</p><small>Preview only: no funds can be sent from this page.</small></div></aside>
        <article className="dash-panel dash-withdraw-panel">
          <div className="dash-withdraw-balance"><span><Wallet size={19} /> Available to withdraw <i>Sample</i></span><strong>{money.format(available)}</strong><label htmlFor="withdraw-wallet">From balance</label><select id="withdraw-wallet" value={wallet} onChange={(event) => { setWallet(event.target.value as "trading" | "referral"); setPreviewNotice(false); }}><option value="trading">Trading wallet</option><option value="referral">Referral earnings</option></select></div>
          <h2 className="dash-deposit-step-title"><span>1</span>Recipient wallet address</h2>
          <label className="dash-deposit-label" htmlFor="withdraw-address">USDT wallet address</label>
          <div className="dash-withdraw-address-row"><input id="withdraw-address" type="text" autoComplete="off" spellCheck={false} placeholder="Paste the destination wallet address" value={address} onChange={(event) => { setAddress(event.target.value); setPreviewNotice(false); }} /><button type="button" onClick={pasteAddress}><Clipboard size={16} /> Paste</button></div>
          <p className="dash-deposit-helper">Confirm the destination address and supported network before requesting a withdrawal. Network options will be shown when configured.</p>
          {pasteMessage && <p className="dash-withdraw-inline-note" role="status">{pasteMessage}</p>}
          {address.trim() && <div className="dash-withdraw-progress-step"><h2 className="dash-deposit-step-title"><span>2</span>Withdrawal amount</h2><label className="dash-deposit-label" htmlFor="withdraw-amount">Amount (USDT)</label><div className="dash-deposit-input-wrap"><input id="withdraw-amount" type="number" min="0" step="any" inputMode="decimal" placeholder="Enter amount" value={amount} onChange={(event) => { setAmount(event.target.value); setPreviewNotice(false); }} /><span>USDT</span><button type="button" onClick={() => { setAmount(String(available)); setPreviewNotice(false); }}>Max</button></div><p className="dash-deposit-helper">Available: {money.format(available)} · Network fees will be displayed before confirmation.</p>{amount && !validAmount && <p className="dash-withdraw-inline-error" role="alert">Enter an amount greater than zero and no more than your available balance.</p>}</div>}
          {validAmount && address.trim() && <div className="dash-withdraw-progress-step"><h2 className="dash-deposit-step-title"><span>3</span>Review your request</h2><div className="dash-withdraw-review"><div><span>From</span><strong>{wallet === "trading" ? "Trading wallet" : "Referral earnings"}</strong></div><div><span>Amount</span><strong>{money.format(numericAmount)} USDT</strong></div><div><span>Processing time</span><strong>Within 1–24 hours</strong></div><div><span>Network</span><strong>Confirmed when available</strong></div></div><button className="dash-withdraw-review-button" type="button" onClick={() => setModalOpen(true)}>Review withdrawal <ArrowRight size={16} /></button></div>}
          {previewNotice && <p className="dash-withdraw-preview-notice" role="status"><ShieldCheck size={16} /> Preview only — no withdrawal request was sent.</p>}
          <p className="dash-deposit-disabled-note"><LockKeyhole size={14} /> Final withdrawal verification will be connected with secure account services.</p>
        </article>
      </div>
      <aside className="dash-panel dash-deposit-status"><span className="dash-overline">WITHDRAWAL STATUS</span><h2>Request steps</h2><div className="dash-deposit-timeline"><div className="current"><i><Check size={13} /></i><span><strong>Enter destination</strong><small>Use a wallet address that you control.</small></span></div><div><i>2</i><span><strong>Review details</strong><small>Confirm balance, amount, and destination.</small></span></div><div><i>3</i><span><strong>Processing</strong><small>Requests are expected within 1–24 hours.</small></span></div><div><i>4</i><span><strong>Completed or declined</strong><small>Check your history for status updates.</small></span></div></div></aside>
    </div>
  </section>
    {modalOpen && typeof document !== "undefined" && createPortal(<div className="dash-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}><section className="dash-modal-card" role="dialog" aria-modal="true" aria-labelledby="withdraw-modal-title"><header><span className="dash-modal-icon"><ShieldCheck size={20} /></span><button type="button" onClick={() => setModalOpen(false)} aria-label="Close review"><X size={20} /></button></header><h2 id="withdraw-modal-title">Confirm withdrawal details</h2><p>Review the request before continuing.</p><div className="dash-modal-summary"><div><span>Amount</span><strong>{money.format(numericAmount)} USDT</strong></div><div><span>From</span><strong>{wallet === "trading" ? "Trading wallet" : "Referral earnings"}</strong></div><div><span>Destination</span><strong>{address.length > 18 ? `${address.slice(0, 9)}…${address.slice(-6)}` : address}</strong></div><div><span>Expected processing</span><strong>1–24 hours</strong></div></div><aside className="dash-modal-preview"><Info size={16} /><span>This is a frontend preview. No withdrawal will be submitted and no funds will move.</span></aside><footer><button type="button" className="dash-modal-secondary" onClick={() => setModalOpen(false)}>Edit details</button><button type="button" className="dash-modal-primary" onClick={() => { setModalOpen(false); setPreviewNotice(true); }}>Got it</button></footer></section></div>, document.body)}
  </>;
}
