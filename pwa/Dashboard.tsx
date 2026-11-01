"use client";

import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Award, Check, ChevronDown, Clock3, Copy,
  CircleHelp, Crown, Gem, Home, LogOut, Medal, Menu, ReceiptText, Settings, ShieldCheck,
  Sparkles, Users, Wallet, X, Zap, User, Plus, Link2, Share2, UserPlus, Coins,
} from "lucide-react";
import { type MouseEvent as ReactMouseEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BtcMarketChart } from "../components/BtcMarketChart";
import { DepositView } from "./DepositView";
import { WithdrawalView } from "./WithdrawalView";
import { authRequest, AuthUser } from "../lib/auth-api";
import { AppPreloader } from "../components/AppPreloader";
import loadingStyles from "../components/AppPreloader.module.css";
import { financeRequest, financeStatusLabel, financeStatusTone, FinanceSummary, FinanceTransaction } from "../lib/finance-api";
import { NotificationBell, NotificationProvider, NotificationsPage } from "./NotificationCenter";
import { referralRequest, ReferralOverview } from "../lib/referral-api";
import { CopyTradeSignal, TradeDashboard, TradePosition, tradeRequest } from "../lib/trading-api";

const navItems = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "trading", label: "Copy trading", icon: Zap },
  { id: "referrals", label: "Referrals", icon: Users },
  { id: "levels", label: "My level", icon: Award },
  { id: "transactions", label: "Transactions", icon: ReceiptText },
];
const formatView = (id: string) => navItems.find((item) => item.id === id)?.label ?? (id === "help" ? "Help & support" : id === "notifications" ? "Notifications" : id === "deposit" ? "Deposit" : id === "withdraw" ? "Withdraw" : "Settings");
const validViews = new Set([...navItems.map(({ id }) => id), "settings", "help", "deposit", "withdraw", "notifications"]);
const normalizeView = (value: string | null | undefined) => value && validViews.has(value) ? value : "overview";
const money = (amount: number) => `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })} USD`;
const emptyFinance: FinanceSummary = { balances: { trading: 0, referral: 0, availableTrading: 0, availableReferral: 0 }, transactions: [] };

function BalanceAmount({ amount }: { amount: number }) {
  return <>{amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}<small className="dash-currency-unit">USD</small></>;
}

function Brand() {
  return <a href="/pwa" className="dash-brand" aria-label="EchoVest home"><span className="brand-icon-crop"><img src="/echovest-icon.png" alt="" /></span><span>EchoVest</span></a>;
}

function NavLinks({ active, onNavigate }: { active: string; onNavigate?: () => void }) {
  return <nav className="dash-nav" aria-label="Main navigation">
    <p className="dash-nav-label">Workspace</p>
    {navItems.map(({ id, label, icon: Icon }) => <a key={id} href={id === "overview" ? "/dashboard" : `/dashboard?view=${id}`} className={`dash-nav-link ${active === id ? "active" : ""}`} aria-current={active === id ? "page" : undefined} onClick={onNavigate}><Icon size={19} strokeWidth={1.9} /><span>{label}</span></a>)}
    <p className="dash-nav-label dash-nav-label-bottom">Account</p>
    <a href="/dashboard?view=settings" className={`dash-nav-link ${active === "settings" ? "active" : ""}`} aria-current={active === "settings" ? "page" : undefined} onClick={onNavigate}><Settings size={19} strokeWidth={1.9} /><span>Settings</span></a>
    <a href="/dashboard?view=help" className={`dash-nav-link ${active === "help" ? "active" : ""}`} aria-current={active === "help" ? "page" : undefined} onClick={onNavigate}><CircleHelp size={19} strokeWidth={1.9} /><span>Help & support</span></a>
  </nav>;
}

function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="dash-page-heading"><div><p className="dash-kicker">YOUR ACCOUNT</p><h1>{title}</h1><p className="dash-subtitle">{subtitle}</p></div><NotificationBell className="dash-page-mobile-notification" size={21} /></div>;
}

function ActivityList({ transactions = [] }: { transactions?: FinanceTransaction[] }) {
  if (!transactions.length) return <p className="dash-deposit-helper">No account activity yet.</p>;
  return <div className="dash-activity-list">{transactions.map((item) => <div className="dash-activity-row" key={item.id}>
    <span className={`dash-activity-icon ${item.type === "deposit" ? "in" : "out"}`} aria-hidden="true">{item.type === "deposit" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span>
    <span className="dash-activity-main"><b>{item.type === "deposit" ? "Deposit" : "Withdrawal"}</b><small>{item.network} - {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}</small></span>
    <span className="dash-activity-amount"><b className={item.type === "deposit" ? "in" : "out"}>{item.type === "deposit" ? "+" : "-"}{money(item.amount)}</b><small className={`dash-status-label ${financeStatusTone(item.status)}`}>{financeStatusLabel(item.status)}</small></span>
  </div>)}</div>;
}

function Overview({ email, name, finance }: { email: string; name: string; finance: FinanceSummary }) {
  return <>
    <MobileHome email={email} name={name} finance={finance} />
    <div className="dash-desktop-overview">
    <PageHeading title="Your overview" subtitle="A quick look at your wallet and trading activity." />
    <section className="dash-stat-grid" aria-label="Account summary">
      <article className="dash-balance-card"><div className="dash-balance-top"><span>Total wallet balance</span><Wallet size={19} /></div><strong><BalanceAmount amount={finance.balances.availableTrading + finance.balances.availableReferral} /></strong><p><span className="dash-sample-dot" /> Available balance</p><div className="dash-balance-footer"><span>Investment {money(finance.balances.availableTrading)}</span><span>Referral {money(finance.balances.availableReferral)}</span></div></article>
      <article className="dash-stat-card"><span className="dash-stat-icon teal"><Users size={19} /></span><small>Referral earnings</small><strong>{money(finance.balances.availableReferral)}</strong><span className="dash-stat-caption">Held in a separate balance</span><a href="/dashboard?view=referrals">View referrals <ArrowRight size={14} /></a></article>
      <article className="dash-stat-card"><span className="dash-stat-icon blue"><Zap size={19} /></span><small>Copying now</small><strong>0 <em>strategies</em></strong><span className="dash-stat-caption">No active strategy allocations</span><a href="/dashboard?view=trading">View strategies <ArrowRight size={14} /></a></article>
      <article className="dash-stat-card"><span className="dash-stat-icon violet"><Award size={19} /></span><small>Membership level</small><strong>Blue</strong><span className="dash-stat-caption">Your current level</span><a href="/dashboard?view=levels">View level <ArrowRight size={14} /></a></article>
    </section>

    <section className="dash-content-grid">
      <article className="dash-panel dash-activity-panel"><div className="dash-panel-heading"><div><h2>Recent activity</h2><p>Latest wallet updates</p></div><a href="/dashboard?view=transactions">All activity <ArrowRight size={15} /></a></div><ActivityList transactions={finance.transactions.slice(0, 3)} /></article>
      <article className="dash-panel dash-signals-panel"><div className="dash-panel-heading"><div><h2>Copy trading</h2><p>Your active strategies</p></div><span className="dash-soft-count">0 active</span></div>
        <p className="dash-deposit-helper">No active copy-trading strategies.</p>
        <a className="dash-panel-link" href="/dashboard?view=trading">Manage strategies <ArrowRight size={15} /></a>
      </article>
    </section>
    <div className="dash-disclosure"><ShieldCheck size={17} /><span>Copy trading involves risk, including the potential loss of funds. Past performance does not guarantee future results.</span></div>
    </div>
  </>;
}

function MobileHome({ email, name, finance }: { email: string; name: string; finance: FinanceSummary }) {
  const firstName = name.split(/\s+/)[0] || email.split("@")[0]?.split(/[._-]/)[0] || "there";
  return <section className="dash-mobile-home" aria-label="Home overview">
    <header className="dash-mobile-greeting"><div><p>Hello, <strong>{firstName}</strong> <span aria-hidden="true">👋</span></p><small>Welcome back!</small></div><div className="dash-mobile-greeting-actions"><a href="/dashboard?view=levels" className="dash-mobile-level"><Award size={14} /> Blue</a><NotificationBell className="dash-mobile-notification" size={22} /></div></header>
    <article className="dash-mobile-balance">
      <div className="dash-mobile-balance-head"><span>Main wallet</span><Wallet size={19} /></div>
      <strong><BalanceAmount amount={finance.balances.availableTrading} /></strong>
      <div className="dash-mobile-balance-actions"><a href="/dashboard?view=deposit"><Plus size={16} /> Deposit</a><a href="/dashboard?view=withdraw"><ArrowUpRight size={16} /> Withdraw</a></div>
    </article>
    <div className="dash-mobile-summary">
      <a href="/dashboard?view=referrals"><span className="dash-mobile-summary-icon"><Users size={17} /></span><small>Referral earnings</small><strong>{money(finance.balances.availableReferral)}</strong></a>
      <a href="/dashboard?view=trading"><span className="dash-mobile-summary-icon"><Zap size={17} /></span><small>Copying now</small><strong>0 strategies</strong></a>
    </div>
    <nav className="dash-mobile-shortcuts" aria-label="Quick actions">
      <a href="/dashboard?view=trading"><span><Zap size={19} /></span>Trade</a>
      <a href="/dashboard?view=wallet"><span><ShieldCheck size={19} /></span>Vault</a>
      <a href="/dashboard?view=referrals"><span><Users size={19} /></span>Referral</a>
    </nav>
    <BtcMarketChart />
    <article className="dash-mobile-activity"><div><h2>Recent activity</h2><a href="/dashboard?view=transactions">See all <ArrowRight size={14} /></a></div>{finance.transactions.length ? finance.transactions.slice(0, 3).map((item) => <div className="dash-mobile-activity-row" key={item.id}><span className={`dash-mobile-activity-icon ${item.type === "withdrawal" ? "out" : "in"}`}>{item.type === "deposit" ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</span><span><b>{item.type === "deposit" ? "Deposit" : "Withdrawal"}</b><small className={`dash-status-label ${financeStatusTone(item.status)}`}>{financeStatusLabel(item.status)}</small></span><strong className={item.type === "deposit" ? "in" : "out"}>{item.type === "deposit" ? "+" : "-"}{money(item.amount)}</strong></div>) : <p className="dash-deposit-helper">No transactions yet.</p>}</article>
    <p className="dash-mobile-disclosure">Account balances update after approved transactions.</p>
  </section>;
}

function WalletView({ finance }: { finance: FinanceSummary }) {
  return <><PageHeading title="Wallet" subtitle="Review your balances and recent wallet activity." /><div className="dash-subview-stats"><article className="dash-panel"><span className="dash-overline">INVESTMENT BALANCE</span><strong className="dash-large-value">{money(finance.balances.availableTrading)}</strong><p>Deposits are credited after admin approval</p><div className="dash-wallet-actions"><a className="dash-outline-button" href="/dashboard?view=deposit">Deposit funds <ArrowRight size={15} /></a><a className="dash-outline-button" href="/dashboard?view=withdraw">Withdraw funds <ArrowRight size={15} /></a></div></article><article className="dash-panel"><span className="dash-overline">REFERRAL BALANCE</span><strong className="dash-large-value">{money(finance.balances.availableReferral)}</strong><p>Shown separately from your investment balance</p><a className="dash-outline-button" href="/dashboard?view=referrals">Referral details <ArrowRight size={15} /></a></article></div><article className="dash-panel dash-full-panel"><div className="dash-panel-heading"><div><h2>Wallet activity</h2><p>Deposit and withdrawal requests</p></div><a href="/dashboard?view=transactions">See all <ArrowRight size={15} /></a></div><ActivityList transactions={finance.transactions} /></article></>;
}

function TradingView({ balance, onBalanceUpdated }: { balance: number; onBalanceUpdated: () => void }) {
  const [dashboard, setDashboard] = useState<TradeDashboard>({ openTrades: [], positions: [] });
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [interestAmounts, setInterestAmounts] = useState<Record<string, string>>({});
  const [interestAddresses, setInterestAddresses] = useState<Record<string, string>>({});
  const [interestNetworks, setInterestNetworks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = async () => { try { setDashboard(await tradeRequest<TradeDashboard>("me")); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load copy trades."); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 30_000); return () => window.clearInterval(timer); }, []);
  const moneyValue = (value: number) => `${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })} USD`;
  const dateValue = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const withdrawalWindowOpen = (position: TradePosition) => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: position.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      const dayIndex = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[parts.find((part) => part.type === "weekday")?.value ?? ""];
      const time = `${parts.find((part) => part.type === "hour")?.value ?? "00"}:${parts.find((part) => part.type === "minute")?.value ?? "00"}`;
      return position.interestWithdrawalDays.includes(dayIndex) && time >= position.interestWindowStart && time <= position.interestWindowEnd;
    } catch { return false; }
  };
  const perform = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key); setError(""); setNotice("");
    try { await action(); setNotice(success); await refresh(); onBalanceUpdated(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The trade action could not be completed."); }
    finally { setBusy(""); }
  };
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const participationBySignal = new Map(dashboard.positions.map((position) => [position.signalId, position]));
  return <><PageHeading title="Copy trading" subtitle="Choose a live trade, review the terms, and decide when to stop copying." />
    <section className="dash-trade-wallet"><span><Wallet size={19}/></span><div><small>Available to invest</small><strong>{moneyValue(balance)}</strong></div><a href="/dashboard?view=wallet">View wallet <ArrowRight size={14}/></a></section>
    <div className="dash-trade-disclosure"><ShieldCheck size={17}/><span>Each trade displays its configured ROI and capital lock term. ROI is a projection and is not guaranteed. Your principal stays locked until its maturity date, including if you stop copying early.</span></div>
    {error && <p className="dash-notification-error" role="alert">{error}</p>}{notice && <p className="dash-trade-success" role="status"><Check size={15}/>{notice}</p>}
    <section className="dash-trade-section"><div className="dash-trade-section-heading"><div><p>LIVE NOW</p><h2>Available to copy</h2></div><span>{dashboard.openTrades.length} {dashboard.openTrades.length === 1 ? "trade" : "trades"}</span></div>
      {loading ? <article className="dash-panel dash-trade-empty">Loading live trades…</article> : dashboard.openTrades.length ? <div className="dash-trade-grid">{dashboard.openTrades.map((trade: CopyTradeSignal) => {
        const position = trade.participation ?? participationBySignal.get(trade.id);
        const amount = amounts[trade.id] ?? String(trade.minimumInvestment);
        return <article className="dash-trade-card" key={trade.id}><div className="dash-trade-card-top"><span className="dash-trade-pair-icon"><Zap size={18}/></span><span className="dash-trade-live"><i/>Live</span></div><p className="dash-trade-pair">{trade.pair}</p><h3>{trade.title}</h3><div className="dash-trade-terms"><div><small>Configured ROI</small><strong>{trade.roiPercent}%</strong><span>over full term</span></div><div><small>Capital lock</small><strong>{trade.lockDays} days</strong><span>until {dateValue(trade.closesAt)}</span></div></div>
          <div className="dash-trade-mini-details"><span>Entry range</span><strong>{moneyValue(trade.minimumInvestment)} – {moneyValue(trade.maximumInvestment)}</strong></div><div className="dash-trade-mini-details"><span>Interest window</span><strong>{trade.interestWithdrawalDays.map((day) => dayNames[day]).join(", ")} · {trade.interestWindowStart}–{trade.interestWindowEnd} {trade.timezone}</strong></div>
          {position ? <div className={`dash-trade-joined ${position.status}`}><div><strong>{position.status === "active" ? "You’re copying this trade" : position.status === "stopped" ? "Copying stopped" : "Trade matured"}</strong><small>{moneyValue(position.principal)} principal · {position.status === "matured" ? "Principal returned" : `Matures ${dateValue(position.maturesAt)}`}</small></div>{position.status === "active" && <button type="button" disabled={busy === position.id} onClick={() => void perform(position.id, () => tradeRequest(`positions/${position.id}/stop`, "POST", {}), "Copying stopped. Your principal remains locked until maturity.")}>Stop</button>}</div> : <form className="dash-trade-join" onSubmit={(event) => { event.preventDefault(); void perform(trade.id, async () => { await tradeRequest(`${trade.id}/join`, "POST", { amount: Number(amount) }); setAmounts((current) => ({ ...current, [trade.id]: amount })); }, "Trade joined. Your capital is now locked for the stated term."); }}><label>Investment amount<input type="number" min={trade.minimumInvestment} max={trade.maximumInvestment} step="0.01" value={amount} onChange={(event) => setAmounts((current) => ({ ...current, [trade.id]: event.target.value }))} required /></label><small>Available balance: {moneyValue(balance)}</small><button type="submit" disabled={Boolean(busy) || Number(amount) > balance || Number(amount) < trade.minimumInvestment}>{busy === trade.id ? "Joining…" : <><Zap size={15}/> Copy trade</>}</button></form>}
        </article>;
      })}</div> : <article className="dash-panel dash-trade-empty"><span><Clock3 size={20}/></span><strong>No live trade right now</strong><p>Scheduled copy trades will appear here when they go live.</p></article>}
    </section>
    <section className="dash-trade-section"><div className="dash-trade-section-heading"><div><p>YOUR ACTIVITY</p><h2>My copied trades</h2></div><span>{dashboard.positions.length} joined</span></div>
      {dashboard.positions.length ? <div className="dash-position-list">{dashboard.positions.map((position) => { const windowOpen = withdrawalWindowOpen(position); return <article className="dash-panel dash-position-card" key={position.id}><div className="dash-position-head"><span className="dash-trade-pair-icon"><Zap size={17}/></span><div><strong>{position.pair}</strong><small>{position.title}</small></div><span className={`dash-position-status ${position.status}`}>{position.status === "active" ? "Copying" : position.status === "stopped" ? "Stopped" : "Matured"}</span></div><div className="dash-position-values"><div><small>Locked principal</small><strong>{moneyValue(position.principal)}</strong></div><div><small>Accrued interest</small><strong className="positive">{moneyValue(position.interestAccrued)}</strong></div><div><small>Available to request</small><strong>{moneyValue(position.interestAvailable)}</strong></div><div><small>Principal maturity</small><strong>{dateValue(position.maturesAt)}</strong></div></div>
          {position.interestAvailable >= 0.01 && <div className="dash-interest-claim"><div><strong>{windowOpen ? "Interest withdrawal window is open" : "Interest withdrawal window"}</strong><small>{position.interestWithdrawalDays.map((day) => dayNames[day]).join(", ")} · {position.interestWindowStart}–{position.interestWindowEnd} ({position.timezone}). Requests require admin review.</small></div><label>Request amount<input type="number" min="0.01" max={position.interestAvailable} step="0.01" value={interestAmounts[position.id] ?? (Math.floor(position.interestAvailable * 100) / 100).toFixed(2)} onChange={(event) => setInterestAmounts((current) => ({ ...current, [position.id]: event.target.value }))}/></label><label>Wallet address<input type="text" autoComplete="off" placeholder="Destination address" value={interestAddresses[position.id] ?? ""} onChange={(event) => setInterestAddresses((current) => ({ ...current, [position.id]: event.target.value }))}/></label><label>Network<input type="text" placeholder="e.g. TRC20" value={interestNetworks[position.id] ?? ""} onChange={(event) => setInterestNetworks((current) => ({ ...current, [position.id]: event.target.value }))}/></label><button type="button" disabled={!windowOpen || Boolean(busy) || Number(interestAmounts[position.id] ?? position.interestAvailable) > position.interestAvailable || Number(interestAmounts[position.id] ?? position.interestAvailable) < 0.01 || (interestAddresses[position.id] ?? "").trim().length < 8 || !(interestNetworks[position.id] ?? "").trim()} onClick={() => void perform(`interest-${position.id}`, () => tradeRequest(`positions/${position.id}/withdraw-interest`, "POST", { amount: Number(interestAmounts[position.id] ?? position.interestAvailable), destinationAddress: interestAddresses[position.id], network: interestNetworks[position.id] }), "Interest withdrawal submitted for admin review.")}>{busy === `interest-${position.id}` ? "Submitting…" : "Request interest"}</button></div>}
        </article>; })}</div> : <article className="dash-panel dash-trade-empty dash-position-empty"><strong>You haven’t copied a trade yet</strong><p>Your trade positions and earned interest will show here after you join a live trade.</p></article>}
    </section>
  </>;
}

function ReferralsView({ balance }: { balance: number }) {
  const [overview, setOverview] = useState<ReferralOverview | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { referralRequest<ReferralOverview>("me").then(setOverview).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load your referral details.")); }, []);
  const link = overview && typeof window !== "undefined" ? `${window.location.origin}/sign-up?ref=${encodeURIComponent(overview.referralCode)}` : "";
  async function copyLink() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError("Could not copy the invite link. Please copy it from the field."); }
  }
  async function shareLink() {
    if (!link) return;
    if (navigator.share) {
      try { await navigator.share({ title: "Join me on EchoVest", text: "Sign up with my referral link on EchoVest.", url: link }); }
      catch (cause) { if (cause instanceof Error && cause.name !== "AbortError") setError("Could not open the share menu."); }
    } else await copyLink();
  }
  const memberCount = overview ? overview.counts.tier1 + overview.counts.tier2 + overview.counts.tier3 : 0;
  return <><PageHeading title="Referrals" subtitle="Invite friends, grow your network, and track your referral rewards." />
    <section className="dash-referral-hero">
      <div className="dash-referral-hero-copy"><span className="dash-referral-hero-icon"><Users size={19} /></span><p className="dash-referral-hero-kicker">GROW YOUR NETWORK</p><h2>Good things grow<br />when shared.</h2><p>Invite people to EchoVest and follow your community across three referral tiers.</p>
        {overview && <div className="dash-referral-code"><span>Your invite code</span><strong>{overview.referralCode}</strong><span className="dash-referral-level"><Award size={14} /> {overview.membershipLevel} member</span></div>}
      </div>
      <div className="dash-referral-hero-art" aria-hidden="true"><span className="dash-referral-orbit orbit-one"/><span className="dash-referral-orbit orbit-two"/><span className="dash-referral-person person-one"><User size={24}/></span><span className="dash-referral-person person-two"><User size={21}/></span><span className="dash-referral-person person-three"><User size={18}/></span><span className="dash-referral-connecting"><Link2 size={20}/></span></div>
    </section>
    <section className="dash-referral-metrics" aria-label="Referral summary">
      <article className="dash-referral-metric"><span className="metric-icon mint"><Wallet size={18}/></span><div><small>Available rewards</small><strong>{money(balance)}</strong><span>Referral balance</span></div></article>
      <article className="dash-referral-metric"><span className="metric-icon gold"><Coins size={18}/></span><div><small>Total earned</small><strong>{money(overview?.referralBalanceEarned ?? 0)}</strong><span>Commission credited</span></div></article>
      <article className="dash-referral-metric"><span className="metric-icon blue"><UserPlus size={18}/></span><div><small>Network members</small><strong>{overview ? memberCount : "?"}</strong><span>Across all three tiers</span></div></article>
    </section>
    <section className="dash-referral-lower-grid">
      <article className="dash-panel dash-referral-invite-panel"><div className="dash-panel-heading"><div><h2>Your invite link</h2><p>Friends who sign up with this link join your network.</p></div><span className="dash-referral-link-mark"><Link2 size={17}/></span></div>
        {overview ? <><div className="dash-referral-link-box"><input aria-label="Referral link" readOnly value={link} /><button className="dash-outline-button" type="button" onClick={() => void copyLink()}>{copied ? <Check size={15}/> : <Copy size={15}/>}<span>{copied ? "Copied" : "Copy link"}</span></button></div><button type="button" className="dash-referral-share" onClick={() => void shareLink()}><Share2 size={15}/> Share invite link</button><p className="dash-referral-footnote">Your referral assignment is permanent after signup. Signup-only bonuses are not awarded.</p></> : <p className="dash-deposit-helper">{error || "Loading your invite link?"}</p>}
      </article>
      <article className="dash-panel dash-referral-network-panel"><div className="dash-panel-heading"><div><h2>Network overview</h2><p>Your community across three referral tiers.</p></div><span className="dash-soft-count">{overview ? `${memberCount} members` : "Loading"}</span></div>
        <div className="dash-referral-tiers">{([1, 2, 3] as const).map((tier) => { const count = overview?.counts[`tier${tier}`] ?? 0; return <div className="dash-referral-tier" key={tier}><span className={`dash-referral-tier-mark tier-${tier}`}>{tier}</span><span><strong>Tier {tier}</strong><small>{tier === 1 ? "Direct invites" : tier === 2 ? "Second level" : "Third level"}</small></span><b>{count}</b></div>; })}</div>
      </article>
    </section>
    <article className="dash-panel dash-full-panel dash-referral-downline"><div className="dash-panel-heading"><div><h2>Your downline</h2><p>Review member activity and commissions. Their wallet balances remain private.</p></div><span className="dash-soft-count">{overview ? `${overview.downliners.length} shown` : "?"}</span></div>
      {error && <p className="dash-notification-error" role="alert">{error}</p>}
      {overview?.downliners.length ? <div className="dash-referral-members">{overview.downliners.map((member) => <div className="dash-referral-member" key={member.id}><span className="dash-referral-member-avatar">{member.fullName.trim().charAt(0).toUpperCase()}</span><span className="dash-referral-member-name"><strong>{member.fullName}</strong><small>{member.joinedAt ? `Joined ${new Date(member.joinedAt).toLocaleDateString()}` : "EchoVest member"}</small></span><span className={`dash-referral-member-tier tier-${member.tier}`}>Tier {member.tier}</span><span className="dash-referral-member-earned"><strong>{money(member.earned)}</strong><small>Commission earned</small></span></div>)}</div> : <div className="dash-referral-empty"><span><Users size={21}/></span><strong>{overview ? "Your network starts here" : "Loading your network?"}</strong><p>{overview ? "Share your invite link to welcome your first member." : "Your referral members will appear here."}</p></div>}
    </article>
  </>;
}

function LevelsView() {
  const levels = [
    { name: "Blue", icon: ShieldCheck, tone: "blue" },
    { name: "Elite", icon: Medal, tone: "elite" },
    { name: "Silver", icon: Award, tone: "silver" },
    { name: "Gold", icon: Crown, tone: "gold" },
    { name: "Platinum", icon: Gem, tone: "platinum" },
  ];
  return <><PageHeading title="Membership level" subtitle="See your current level and learn how progression works." /><article className="dash-level-card"><div className="dash-level-emblem"><ShieldCheck size={31} /></div><div><span className="dash-overline">CURRENT LEVEL</span><h2>Blue</h2><p>Blue is your starting membership level.</p></div><span className="dash-level-chip">Active</span></article><article className="dash-panel dash-full-panel dash-level-info"><h2>Level progression</h2><p>EchoVest levels are Blue, Elite, Silver, Gold, and Platinum. You can qualify through team activity or a qualifying buy-in.</p><div className="dash-level-list">{levels.map(({ name, icon: Icon, tone }, index) => <span className={`dash-level-badge ${tone}${index === 0 ? " current" : ""}`} key={name}><i><Icon size={18} strokeWidth={2} /></i><b>{name}</b>{index === 0 && <small>Current</small>}</span>)}</div><div className="dash-disclosure"><CircleHelp size={17} /><span>Specific thresholds and commission rates are being confirmed and are not displayed yet.</span></div></article></>;
}

function TransactionsView({ finance }: { finance: FinanceSummary }) {
  return <><PageHeading title="Transactions" subtitle="Review your deposit and withdrawal requests." /><article className="dash-panel dash-full-panel"><div className="dash-panel-heading"><div><h2>All activity</h2><p>Latest finance requests</p></div></div><ActivityList transactions={finance.transactions} /></article></>;
}

function SettingsView({ email, name, onSignOut }: { email: string; name: string; onSignOut: () => void }) {
  return <><PageHeading title="Settings" subtitle="Manage your account preferences." /><article className="dash-panel dash-settings-card"><div className="dash-profile-large">{name.slice(0, 1).toUpperCase() || email.slice(0, 1).toUpperCase() || "U"}</div><div><span className="dash-overline">SIGNED IN AS</span><h2>{name || email}</h2><p>{email}</p></div></article><article className="dash-panel dash-full-panel dash-security-note"><ShieldCheck size={20} /><div><b>Account security</b><p>Your account uses a protected server session.</p></div></article><article className="dash-panel dash-full-panel"><div className="dash-panel-heading"><div><h2>Account access</h2><p>End your EchoVest session on this device.</p></div></div><button type="button" className="dash-signout" onClick={onSignOut}><LogOut size={18} />Sign out</button></article><a className="dash-outline-button dash-mobile-help-link" href="/dashboard?view=help">Help &amp; support <ArrowRight size={15} /></a></>;
}

function HelpView() {
  return <><PageHeading title="Help & support" subtitle="Quick answers for the main areas of your EchoVest account." /><div className="dash-help-grid">{[["Account access", "Sign-in and account recovery options will appear here."], ["Wallet and transactions", "Learn how deposits, withdrawals, and status updates work."], ["Copy trading", "Review how to choose an allocation and manage copied strategies."], ["Referral network", "Understand your referral tiers and earnings summary."]].map(([title, copy]) => <article className="dash-panel" key={title}><span className="dash-help-icon"><CircleHelp size={18} /></span><h2>{title}</h2><p>{copy}</p></article>)}</div><div className="dash-disclosure"><CircleHelp size={17} /><span>Support contact details will be added when the support channel is confirmed.</span></div></>;
}

export function Dashboard({ initialView = "overview" }: { initialView?: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [finance, setFinance] = useState<FinanceSummary>(emptyFinance);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState(() => normalizeView(initialView));
  const [signingOut, setSigningOut] = useState(false);

  function navigateWithinDashboard(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || destination.pathname !== "/dashboard") return;
    event.preventDefault();
    const view = normalizeView(destination.searchParams.get("view"));
    const nextUrl = `${destination.pathname}${destination.search}${destination.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.pushState(null, "", nextUrl);
    }
    setActive(view);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    let active = true;
    authRequest<{ user: AuthUser }>("me").then(({ user }) => {
      if (!active) return;
      setEmail(user.email);
      setUserName(user.fullName);
      setReady(true);
      financeRequest<FinanceSummary>("me").then(setFinance).catch(() => undefined);
    }).catch(() => { if (active) router.replace("/sign-in"); });
    return () => { active = false; };
  }, [router]);
  useEffect(() => { if (ready) financeRequest<FinanceSummary>("me").then(setFinance).catch(() => undefined); }, [active, ready]);
  useEffect(() => {
    const syncView = () => setActive(normalizeView(new URLSearchParams(window.location.search).get("view")));
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);
  async function signOut() {
    setSigningOut(true);
    try { await authRequest("signout", {}); } finally { router.replace("/sign-in"); }
  }
  if (!ready) return <AppPreloader label="Loading your account…" />;
  const activeContent = active === "wallet" ? <WalletView finance={finance} /> : active === "deposit" ? <DepositView /> : active === "withdraw" ? <WithdrawalView /> : active === "notifications" ? <NotificationsPage /> : active === "trading" ? <TradingView balance={finance.balances.availableTrading} onBalanceUpdated={() => { void financeRequest<FinanceSummary>("me").then(setFinance).catch(() => undefined); }} /> : active === "referrals" ? <ReferralsView balance={finance.balances.referral} /> : active === "levels" ? <LevelsView /> : active === "transactions" ? <TransactionsView finance={finance} /> : active === "settings" ? <SettingsView email={email} name={userName} onSignOut={signOut} /> : active === "help" ? <HelpView /> : <Overview email={email} name={userName} finance={finance} />;
  const initials = userName ? userName.slice(0, 1).toUpperCase() : email ? email.slice(0, 1).toUpperCase() : "U";
  return <NotificationProvider><div className="dash-app" onClick={navigateWithinDashboard}>
    {signingOut && <AppPreloader label="Signing out…" />}
    <aside className="dash-sidebar"><Brand /><NavLinks active={active} /><div className="dash-sidebar-bottom"><div className="dash-help-card"><span><ShieldCheck size={17} /></span><b>Your account, protected</b><small>Security features are coming soon.</small></div><button type="button" className="dash-signout" onClick={signOut}><LogOut size={18} />Sign out</button></div></aside>
    {mobileOpen && <div className="dash-mobile-backdrop" onClick={() => setMobileOpen(false)} />}
    <aside className={`dash-mobile-sidebar ${mobileOpen ? "open" : ""}`} aria-hidden={!mobileOpen}><div className="dash-mobile-sidebar-head"><Brand /><button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={20} /></button></div><NavLinks active={active} onNavigate={() => setMobileOpen(false)} /></aside>
    <div className="dash-main"><header className="dash-topbar"><button type="button" className="dash-mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><div className="dash-crumb">Workspace <span>/</span> {formatView(active)}</div><div className="dash-topbar-actions"><NotificationBell className="dash-icon-button" label="Notifications" size={18} /><span className="dash-user-separator" /><a className="dash-user-button" href="/dashboard?view=settings"><span className="dash-user-avatar">{initials}</span><span className="dash-user-name">{userName || email}</span><ChevronDown size={15} /></a></div></header>
      <main className="dash-page"><div className="dash-hello"><div><p>Good to see you</p><h2>Welcome back<span>.</span></h2></div></div><div key={active} className={loadingStyles.sectionEnter}>{activeContent}</div></main>
      <nav className="dash-bottom-nav" aria-label="Quick navigation">{[{ id: "overview", label: "Home", icon: Home }, { id: "trading", label: "Trade", icon: Zap }, { id: "wallet", label: "Vault", icon: ShieldCheck }, { id: "transactions", label: "History", icon: ReceiptText }, { id: "settings", label: "Profile", icon: User }].map(({ id, label, icon: Icon }) => <a href={id === "overview" ? "/dashboard" : `/dashboard?view=${id}`} key={id} className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined}><Icon size={20} /><span>{label}</span></a>)}</nav>
    </div>
  </div></NotificationProvider>;
}
