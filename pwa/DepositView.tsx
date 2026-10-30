"use client";

import { ArrowLeft, Bell, Check, Clipboard, Info, LockKeyhole, Upload, Wallet } from "lucide-react";
import { ChangeEvent, useState } from "react";

function StepHeading({ number, title }: { number: number; title: string }) {
  return <h2 className="dash-deposit-step-title"><span>{number}</span>{title}</h2>;
}

export function DepositView() {
  const [amount, setAmount] = useState("");
  const [txid, setTxid] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const validAmount = Number.isFinite(Number(amount)) && Number(amount) > 0;

  function chooseProof(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFileError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setFileError("Choose a PNG, JPG, or JPEG image."); setFileName(""); return; }
    if (file.size > 10 * 1024 * 1024) { setFileError("The image must be 10 MB or smaller."); setFileName(""); return; }
    setFileName(file.name);
  }

  return <section className="dash-deposit-page">
    <a className="dash-deposit-back" href="/dashboard?view=wallet"><ArrowLeft size={17} /> Back to wallet</a>
    <div className="dash-page-heading"><div><p className="dash-kicker">WALLET</p><h1>Deposit</h1><p className="dash-subtitle">Add funds to your EchoVest trading wallet.</p></div><span className="dash-preview-tag"><i /> Preview only</span><a className="dash-page-mobile-notification" href="/dashboard?view=notifications" aria-label="Open notifications"><Bell size={21} /><i /></a></div>
    <div className="dash-deposit-layout">
      <div className="dash-deposit-main">
        <aside className="dash-deposit-notice"><Info size={20} /><div><strong>Before you send</strong><p>Your personal deposit address and supported network will be provided automatically when wallet services are connected. Confirm the asset and network shown in your account before sending crypto.</p><small>Do not send funds to this preview. No address is currently configured.</small></div></aside>
        <article className="dash-panel dash-deposit-panel">
          <StepHeading number={1} title="Send to your deposit address" />
          <div className="dash-deposit-address"><div className="dash-deposit-address-icon"><Wallet size={21} /></div><div><small>PERSONAL DEPOSIT ADDRESS</small><strong>Address appears here after wallet setup</strong><span>Asset and network will be confirmed before a deposit.</span></div><button type="button" disabled aria-label="Copy deposit address"><Clipboard size={17} /> Copy</button></div>
          <div className="dash-deposit-network"><span><i />Network</span><strong>Not configured</strong></div>
          <div className="dash-deposit-divider" />
          <StepHeading number={2} title="Enter deposit amount" />
          <label className="dash-deposit-label" htmlFor="deposit-amount">Amount</label>
          <div className="dash-deposit-input-wrap"><input id="deposit-amount" type="number" min="0" step="any" placeholder="Enter amount" value={amount} onChange={(event) => setAmount(event.target.value)} /><span>USDT</span></div>
          <p className="dash-deposit-helper">Deposit limits will appear when the wallet provider is configured.</p>
          {!validAmount && <p className="dash-deposit-next-hint">Enter an amount to continue to payment proof.</p>}
          {validAmount && <>
          <div className="dash-deposit-divider" />
          <StepHeading number={3} title="Upload payment proof" />
          <p className="dash-deposit-upload-copy">After sending, you can attach a screenshot of your transaction.</p>
          <label className={`dash-deposit-upload ${fileName ? "has-file" : ""}`} htmlFor="deposit-proof"><Upload size={22} /><strong>{fileName || "Choose a payment screenshot"}</strong><small>PNG, JPG, or JPEG · Max 10 MB</small><input id="deposit-proof" type="file" accept="image/png,image/jpeg" onChange={chooseProof} /></label>
          {fileError && <p className="dash-deposit-error" role="alert">{fileError}</p>}
          <label className="dash-deposit-label dash-deposit-txid" htmlFor="deposit-txid">Transaction hash (TXID) <span>Optional</span></label>
          <input id="deposit-txid" className="dash-deposit-txid-input" type="text" placeholder="Paste transaction hash" value={txid} onChange={(event) => setTxid(event.target.value)} />
          <p className="dash-deposit-helper">A TXID helps identify the transfer on the blockchain.</p>
          <button className="dash-deposit-submit" type="button" disabled>Submit deposit</button>
          <p className="dash-deposit-disabled-note"><LockKeyhole size={14} /> Deposit submission will be enabled when secure wallet processing is connected.</p>
          </>}
        </article>
      </div>
      <aside className="dash-panel dash-deposit-status"><span className="dash-overline">DEPOSIT STATUS</span><h2>What happens next?</h2><div className="dash-deposit-timeline"><div className="current"><i><Check size={13} /></i><span><strong>Send funds</strong><small>Use the address and network shown in your account.</small></span></div><div><i>2</i><span><strong>Network confirmation</strong><small>We’ll track the transfer status.</small></span></div><div><i>3</i><span><strong>Wallet credited</strong><small>Confirmed deposits appear in your wallet history.</small></span></div></div><p className="dash-deposit-status-note">The PRD calls for deposit status tracking and an in-app notification after funds are credited.</p></aside>
    </div>
  </section>;
}
