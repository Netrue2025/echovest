"use client";

import { ArrowLeft, Check, Clipboard, Info, LoaderCircle, Wallet, QrCode, RefreshCw, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DepositDetails, walletRequest } from '../lib/wallet-api';
import { NotificationBell } from './NotificationCenter';

const numberFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
type MockStatus = 'pending' | 'confirmed' | 'failed' | 'invalid';

export function DepositView() {
  const [details, setDetails] = useState<DepositDetails | null>(null);
  const [qr, setQr] = useState('');
  const [amount, setAmount] = useState('25.00');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const data = await walletRequest<DepositDetails>('wallet/deposit-address?asset=USDT&network=TRON');
    setDetails(data);
    if (data.account.status === 'active' && data.account.address) {
      const qrCode = await import('qrcode');
      setQr(await qrCode.toDataURL(data.account.address, { width: 190, margin: 1, color: { dark: '#111827', light: '#ffffff' } }));
    } else setQr('');
  }, []);

  useEffect(() => { refresh().catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load your deposit account.')).finally(() => setLoading(false)); }, [refresh]);
  useEffect(() => { const timer = window.setInterval(() => { refresh().catch(() => undefined); }, 15_000); return () => window.clearInterval(timer); }, [refresh]);

  async function copyAddress() {
    if (!details?.account.address || details.mode !== 'chainpay') return;
    try { await navigator.clipboard.writeText(details.account.address); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { setError('Clipboard is unavailable. Select the address and copy it.'); }
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
  const copy = details?.mode === 'chainpay';
  const history = details?.history ?? [];

  return <section className="dash-deposit-page">
    <a className="dash-deposit-back" href="/dashboard?view=wallet"><ArrowLeft size={17} /> Back to wallet</a>
    <div className="dash-page-heading"><div><p className="dash-kicker">WALLET</p><h1>Deposit</h1><p className="dash-subtitle">USDT deposits on TRON (TRC20).</p></div><NotificationBell className="dash-page-mobile-notification" size={21} /></div>

    <div className="dash-deposit-layout"><div className="dash-deposit-main">
      <aside className={`dash-deposit-notice ${isMock ? 'dash-prototype-notice' : ''}`}>
        {isMock ? <TriangleAlert size={20} /> : <Info size={20} />}
        <div><strong>{isMock ? 'TEST MODE — no real funds' : 'Prototype integration notice'}</strong>
          <p>{isMock ? 'This is a simulated deposit account. The TEST address is not a blockchain address. Do not send cryptocurrency to it. TEST funds cannot be withdrawn or used to trade.' : 'Live deposit crediting is not enabled. Do not send funds. ChainPay events are recorded for reconciliation only and never credit your account.'}</p>
        </div>
      </aside>

      <article className="dash-panel dash-deposit-panel dash-prototype-card">
        {loading ? <div className="dash-prototype-loading"><LoaderCircle className="admin-loading-orbit" size={21} /> Loading deposit details…</div> : details ? <>
          <div className="dash-panel-heading"><div><h2>{isMock ? 'Your TEST deposit account' : 'Your USDT deposit account'}</h2><p>{isMock ? 'A stable development account for repeatable simulations.' : 'Permanent account · USDT on TRON (TRC20)'}</p></div><span className="dash-prototype-tag">{isMock ? 'TEST' : 'CHAINPAY'}</span></div>
          {copy && !details.liveDepositsDisabled ? <>
            <div className="dash-deposit-address dash-prototype-address"><div className="dash-deposit-address-icon"><Wallet size={21} /></div><div><small>PERMANENT DEPOSIT ADDRESS</small><strong>{details.account.address || 'Address is being provisioned'}</strong><span>Network: TRON (TRC20) · Asset: USDT</span></div><button type="button" onClick={copyAddress} disabled={!details.account.address}>{copied ? <Check size={17} /> : <Clipboard size={17} />} {copied ? 'Copied' : 'Copy'}</button></div>
          </> : isMock ? <div className="dash-deposit-address dash-prototype-address"><div className="dash-deposit-address-icon"><Wallet size={21} /></div><div><small>MOCK ADDRESS · NOT ON BLOCKCHAIN</small><strong>{details.account.address}</strong><span>Use the simulation controls below. Never send USDT here.</span></div></div> : <div className="dash-prototype-loading"><Info size={19} /> Live address provisioning is disabled for this prototype.</div>}
          {qr && <div className="dash-prototype-qr"><img src={qr} alt={isMock ? 'QR code for the TEST mock address, not a blockchain address' : 'QR code for your USDT TRON deposit address'} /><span><QrCode size={15} /> {isMock ? 'TEST only · not for sending funds' : 'Scan to copy the address'}</span></div>}
          <div className="dash-deposit-network"><span><i />Network</span><strong>TRON (TRC20)</strong></div>
        </> : <p className="dash-deposit-error">Deposit details are unavailable.</p>}
      </article>

      {isMock && <article className="dash-panel dash-deposit-panel dash-test-wallet">
        <div className="dash-panel-heading"><div><h2>TEST wallet balance</h2><p>Separated from your real dashboard balance.</p></div><strong>{numberFormat.format(Number(details?.testWallet.balance ?? 0))} <small>USDT</small></strong></div>
        <div className="dash-test-wallet-lock"><Info size={15} /> TEST funds are non-withdrawable and never affect your investment or referral balances.</div>
        <div className="dash-test-sim"><label htmlFor="test-deposit-amount">Simulation amount <span>USDT</span></label><input id="test-deposit-amount" value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
          <div className="dash-test-actions"><button type="button" disabled={busy || !details} onClick={() => void simulate('pending')}>Simulate pending</button><button type="button" disabled={busy || !details} onClick={() => void simulate('confirmed')}>{busy ? <LoaderCircle size={15} className="admin-loading-orbit" /> : <Check size={15} />} Simulate confirmed</button><button type="button" disabled={busy || !details} onClick={() => void simulate('failed')}>Simulate failed</button><button type="button" disabled={busy || !details} onClick={() => void simulate('invalid')}>Simulate invalid</button></div>
          <button className="dash-test-replay" type="button" disabled={busy || !details} onClick={() => void simulate('confirmed')}><RefreshCw size={14} /> Replay confirmed event to test duplicate handling</button>
        </div>
      </article>}
      {error && <p className="dash-deposit-error" role="alert">{error}</p>}{notice && <p className="dash-deposit-next-hint" role="status">{notice}</p>}

      <article className="dash-panel dash-deposit-panel"><div className="dash-panel-heading"><div><h2>Deposit history</h2><p>{isMock ? 'TEST events only · pending and failed events do not change the TEST balance.' : 'Provider events are not credited in prototype mode.'}</p></div></div>{history.length ? history.map((item) => <div className="dash-activity-row" key={item.id}><span className={`dash-activity-icon ${item.status === 'confirmed' || item.status === 'confirmed_uncredited' ? 'in' : ''}`}><ArrowLeft size={17} /></span><span className="dash-activity-main"><b>{numberFormat.format(Number(item.amount))} USDT deposit {item.testOnly && <small className="dash-prototype-mini-tag">TEST</small>}</b><small>{item.description}</small></span><span className="dash-activity-amount"><b className={`dash-status-label ${item.status === 'confirmed' ? 'approved' : item.status === 'failed' || item.status === 'rejected' || item.status === 'reconciliation_failed' ? 'rejected' : 'review'}`}>{item.status.replaceAll('_', ' ')}</b><small>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</small></span></div>) : <p className="dash-deposit-helper">No deposit events yet.</p>}</article>
    </div><aside className="dash-panel dash-deposit-status"><span className="dash-overline">DEPOSIT STATUS</span><h2>How this prototype works</h2><div className="dash-deposit-timeline"><div className="completed"><i><Check size={13} /></i><span><strong>Permanent account</strong><small>Your USDT/TRON account is reused between visits.</small></span></div><div><i>2</i><span><strong>Network confirmation</strong><small>{isMock ? 'Simulate pending, confirmed, failed, or invalid events in development.' : 'ChainPay events require independent provider reconciliation.'}</small></span></div><div><i>3</i><span><strong>TEST ledger only</strong><small>Simulated funds remain isolated and cannot be withdrawn.</small></span></div></div></aside></div>
  </section>;
}
