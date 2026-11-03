"use client";

import { ArrowLeft, ArrowRight, Check, Clipboard, Info, LoaderCircle, QrCode, RefreshCw, TriangleAlert, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DepositDetails, walletRequest } from '../lib/wallet-api';
import { financeRequest } from '../lib/finance-api';
import { NotificationBell } from './NotificationCenter';
import { AuthSuccess } from './AuthSuccess';

const numberFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
type MockStatus = 'pending' | 'confirmed' | 'failed' | 'invalid';

export function DepositView() {
  const [step, setStep] = useState<'amount' | 'address'>('amount');
  const [details, setDetails] = useState<DepositDetails | null>(null);
  const [qr, setQr] = useState('');
  const [amount, setAmount] = useState('');
  const [txid, setTxid] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const refresh = useCallback(async () => {
    const data = await walletRequest<DepositDetails>('wallet/deposit-address?asset=USDT&network=TRON');
    setDetails(data);
    if (data.account.status === 'active' && data.account.address) {
      const qrCode = await import('qrcode');
      setQr(await qrCode.toDataURL(data.account.address, { width: 190, margin: 1, color: { dark: '#111827', light: '#ffffff' } }));
    } else setQr('');
    return data;
  }, []);

  useEffect(() => {
    if (step !== 'address') return;
    const timer = window.setInterval(() => { refresh().catch(() => undefined); }, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh, step]);

  async function continueToAddress() {
    if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) {
      setError('Enter an amount greater than zero with up to 6 decimal places.');
      return;
    }
    if (details?.minimumDeposit && Number(amount) < details.minimumDeposit) { setError(`The minimum deposit is ${details.minimumDeposit} USDT.`); return; }
    setLoading(true); setError(''); setNotice('');
    try {
      const data = await refresh();
      if (data.liveDepositsDisabled) {
        setError('Live deposits are not enabled on this server yet. Do not send funds.');
        return;
      }
      if (data.account.status !== 'active' || !data.account.address) {
        setError('Your deposit address is not ready yet. Please try again shortly.');
        return;
      }
      setStep('address');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not prepare your deposit address.');
    } finally { setLoading(false); }
  }

  function editAmount() { setStep('amount'); setError(''); setNotice(''); setTxid(''); }

  async function copyAddress() {
    if (!details?.account.address || !['chainpay', 'manual'].includes(details.mode)) return;
    try { await navigator.clipboard.writeText(details.account.address); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { setError('Clipboard is unavailable. Select the address and copy it.'); }
  }

  async function submitManualDeposit() {
    if (!details || details.mode !== 'manual') return;
    setBusy(true); setError(''); setNotice('');
    try {
      await financeRequest('deposits', 'POST', { amount: Number(amount), ...(txid.trim() ? { txid: txid.trim() } : {}) });
      setSubmitted(true);
      setTxid('');
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit this deposit.'); }
    finally { setBusy(false); }
  }

  async function simulate(status: MockStatus) {
    if (!details || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await walletRequest<{ status: string; duplicate: boolean; testOnly: boolean }>('wallet/mock-deposit-event', 'POST', { externalReference: details.account.externalReference, status, amount });
      setNotice(result.duplicate ? `Duplicate TEST ${status} event ignored. TEST funds were not added again.` : `TEST ${status} event recorded. Only a confirmed TEST event affects the TEST wallet.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not simulate the TEST event.'); }
    finally { setBusy(false); }
  }

  const isMock = details?.mode === 'mock';
  const copy = details?.mode === 'chainpay' || details?.mode === 'manual';
  const history = details?.history ?? [];

  if (submitted) return <AuthSuccess pageClassName="dash-deposit-success-page" title="Deposit submitted successfully!" description={`${numberFormat.format(Number(amount))} USDT is awaiting verification. You can check its status in your deposit history.`} action="View deposit status" onContinue={() => { setSubmitted(false); setStep('address'); window.setTimeout(() => document.getElementById('deposit-history-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }} />;

  return <section className="dash-deposit-page">
    <a className="dash-deposit-back" href="/dashboard?view=wallet"><ArrowLeft size={17} /> Back to wallet</a>
    <div className="dash-page-heading"><div><p className="dash-kicker">WALLET</p><h1>Deposit</h1><p className="dash-subtitle">USDT deposits on TRON (TRC20).</p></div><NotificationBell className="dash-page-mobile-notification" size={21} /></div>

    <div className="dash-deposit-layout"><div className="dash-deposit-main">
      <aside className={`dash-deposit-notice ${isMock ? 'dash-prototype-notice' : ''}`}>
        {isMock ? <TriangleAlert size={20} /> : <Info size={20} />}
        <div><strong>{isMock ? 'TEST MODE — no real funds' : step === 'amount' ? 'USDT on TRON (TRC20)' : 'Send only USDT on TRON (TRC20)'}</strong>
          <p>{isMock ? 'This is a simulated deposit account. Its TEST address is not on the blockchain. Never send cryptocurrency to it; TEST funds cannot be withdrawn or used to trade.' : step === 'amount' ? 'Choose your deposit amount, then continue to your personal deposit address.' : 'Send only USDT using the TRON (TRC20) network. Deposits are credited only after provider and network verification.'}</p>
        </div>
      </aside>

      {step === 'amount' ? <article className="dash-panel dash-deposit-panel dash-deposit-amount-step">
        <div className="dash-panel-heading"><div><h2>How much would you like to deposit?</h2><p>Your personal USDT/TRON address will be ready on the next step.</p></div></div>
        <label className="dash-deposit-label" htmlFor="deposit-amount">Deposit amount</label>
        <div className="dash-deposit-input-wrap"><input id="deposit-amount" value={amount} inputMode="decimal" autoComplete="off" onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /><span>USDT</span></div>
        <p className="dash-deposit-helper">{details?.minimumDeposit ? `Minimum deposit: ${details.minimumDeposit} USDT. ` : ''}Enter the amount you plan to send.</p>
        <button className="dash-deposit-submit" type="button" onClick={() => void continueToAddress()} disabled={loading}>{loading ? <><LoaderCircle size={16} className="admin-loading-orbit" /> Preparing address…</> : <>Continue <ArrowRight size={16} /></>}</button>
        {error && <p className="dash-deposit-error" role="alert">{error}</p>}
      </article> : <>
        <article className="dash-panel dash-deposit-panel dash-prototype-card">
          {details ? <>
            <div className="dash-panel-heading"><div><h2>{isMock ? 'Your TEST deposit account' : details.mode === 'manual' ? 'Deposit wallet' : 'Your USDT deposit account'}</h2><p>{isMock ? 'A development-only account for simulations.' : details.mode === 'manual' ? 'Send funds to the deposit address shown below.' : 'Permanent account · USDT on TRON (TRC20)'}</p></div><span className="dash-prototype-tag">{isMock ? 'TEST' : details.mode === 'manual' ? 'MANUAL' : 'CHAINPAY'}</span></div>
            <button type="button" className="dash-deposit-edit-amount" onClick={editAmount}><ArrowLeft size={14} /> Change amount · {numberFormat.format(Number(amount))} USDT</button>
            {copy ? <div className="dash-deposit-address dash-prototype-address"><div className="dash-deposit-address-icon"><Wallet size={21} /></div><div><small>{details.mode === 'manual' ? 'DEPOSIT WALLET ADDRESS' : 'YOUR PERMANENT DEPOSIT ADDRESS'}</small><strong>{details.account.address}</strong><span>Network: {details.depositNetwork || 'TRON (TRC20)'} · Asset: USDT</span></div><button type="button" onClick={copyAddress} disabled={!details.account.address}>{copied ? <Check size={17} /> : <Clipboard size={17} />} {copied ? 'Copied' : 'Copy'}</button></div>
              : <div className="dash-deposit-address dash-prototype-address"><div className="dash-deposit-address-icon"><Wallet size={21} /></div><div><small>MOCK ADDRESS — NOT ON BLOCKCHAIN</small><strong>{details.account.address}</strong><span>Use the simulation controls below. Never send USDT here.</span></div></div>}
            {qr && <div className="dash-prototype-qr"><img src={qr} alt={isMock ? 'QR code for TEST mock address, not a blockchain address' : 'QR code for your USDT TRON deposit address'} /><span><QrCode size={15} /> {isMock ? 'TEST only · not for sending funds' : 'Scan to copy the address'}</span></div>}
            {details.mode === 'manual' && <><div className="dash-deposit-network"><span><i />Network</span><strong>{details.depositNetwork}</strong></div>{details.depositInstructions && <div className="dash-deposit-helper">{details.depositInstructions}</div>}<label className="dash-deposit-label" htmlFor="deposit-txid">Transaction hash <span>(optional)</span></label><div className="dash-deposit-input-wrap"><input id="deposit-txid" value={txid} onChange={(event) => setTxid(event.target.value)} placeholder="Paste transaction hash if available" autoComplete="off" /></div><button className="dash-deposit-submit" type="button" onClick={() => void submitManualDeposit()} disabled={busy}>{busy ? 'Submitting…' : 'Submit deposit'}</button></>}
            {details.mode === 'chainpay' && <div className="dash-deposit-network"><span><i />Network</span><strong>{details.depositNetwork || 'TRON (TRC20)'}</strong></div>}
          </> : <div className="dash-prototype-loading"><LoaderCircle className="admin-loading-orbit" size={21} /> Loading deposit details…</div>}
        </article>

        {isMock && <article className="dash-panel dash-deposit-panel dash-test-wallet">
          <div className="dash-panel-heading"><div><h2>TEST wallet balance</h2><p>Separated from your real dashboard balance.</p></div><strong>{numberFormat.format(Number(details?.testWallet.balance ?? 0))} <small>USDT</small></strong></div>
          <div className="dash-test-wallet-lock"><Info size={15} /> TEST funds are non-withdrawable and never affect your investment or referral balances.</div>
          <div className="dash-test-sim"><label htmlFor="test-deposit-amount">Simulation amount <span>USDT</span></label><input id="test-deposit-amount" value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
            <div className="dash-test-actions"><button type="button" disabled={busy} onClick={() => void simulate('pending')}>Simulate pending</button><button type="button" disabled={busy} onClick={() => void simulate('confirmed')}>{busy ? <LoaderCircle size={15} className="admin-loading-orbit" /> : <Check size={15} />} Simulate confirmed</button><button type="button" disabled={busy} onClick={() => void simulate('failed')}>Simulate failed</button><button type="button" disabled={busy} onClick={() => void simulate('invalid')}>Simulate invalid</button></div>
            <button className="dash-test-replay" type="button" disabled={busy} onClick={() => void simulate('confirmed')}><RefreshCw size={14} /> Replay confirmed event to test duplicate handling</button>
          </div>
        </article>}
        {error && <p className="dash-deposit-error" role="alert">{error}</p>}{notice && <p className="dash-deposit-next-hint" role="status">{notice}</p>}
        <article id="deposit-history-section" className="dash-panel dash-deposit-panel"><div className="dash-panel-heading"><div><h2>Deposit history</h2><p>{isMock ? 'TEST events only · simulated funds do not affect your real balance.' : 'Deposits are credited after verification.'}</p></div></div>{history.length ? history.map((item) => <div className="dash-activity-row" key={item.id}><span className={`dash-activity-icon ${item.status === 'confirmed' || item.status === 'confirmed_uncredited' ? 'in' : ''}`}><ArrowLeft size={17} /></span><span className="dash-activity-main"><b>{numberFormat.format(Number(item.amount))} USDT deposit {item.testOnly && <small className="dash-prototype-mini-tag">TEST</small>}</b><small>{item.description}</small></span><span className="dash-activity-amount"><b className={`dash-status-label ${item.status === 'confirmed' || item.status === 'approved' ? 'approved' : item.status === 'failed' || item.status === 'rejected' || item.status === 'reconciliation_failed' ? 'rejected' : 'review'}`}>{item.status.replaceAll('_', ' ')}</b><small>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</small></span></div>) : <p className="dash-deposit-helper">No deposit events yet.</p>}</article>
      </>}
    </div>

    <aside className="dash-panel dash-deposit-status"><span className="dash-overline">DEPOSIT STATUS</span><h2>{step === 'amount' ? 'Deposit steps' : 'What happens next'}</h2><div className="dash-deposit-timeline"><div className={step === 'amount' ? 'current' : 'completed'}><i>{step === 'amount' ? '1' : <Check size={13} />}</i><span><strong>Enter amount</strong><small>Choose how much USDT you plan to send.</small></span></div><div className={step === 'address' ? 'current' : ''}><i>2</i><span><strong>Get your address</strong><small>Your permanent deposit address is assigned to your account.</small></span></div><div><i>3</i><span><strong>Confirm on network</strong><small>Provider and blockchain verification happen before crediting.</small></span></div></div></aside>
    </div>
  </section>;
}
