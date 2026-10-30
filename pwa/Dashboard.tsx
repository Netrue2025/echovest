"use client";

import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Award, Bell, Check, ChevronDown,
  CircleHelp, Copy, Crown, Gem, Home, LogOut, Medal, Menu, ReceiptText, Settings, ShieldCheck,
  Sparkles, Users, Wallet, X, Zap, User, Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BtcMarketChart } from "../components/BtcMarketChart";
import { DepositView } from "./DepositView";
import { WithdrawalView } from "./WithdrawalView";
import { authRequest, AuthUser } from "../lib/auth-api";

const navItems = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "trading", label: "Copy trading", icon: Zap },
  { id: "referrals", label: "Referrals", icon: Users },
  { id: "levels", label: "My level", icon: Award },
  { id: "transactions", label: "Transactions", icon: ReceiptText },
];
const formatView = (id: string) => navItems.find((item) => item.id === id)?.label ?? (id === "help" ? "Help & support" : id === "notifications" ? "Notifications" : id === "deposit" ? "Deposit" : id === "withdraw" ? "Withdraw" : "Settings");
const recentActivity = [
  { title: "Deposit credited", detail: "USDT · Today, 10:42 AM", amount: "+$500.00", type: "in", state: "Completed" },
  { title: "Copy allocation", detail: "BTC Trend Strategy · Yesterday", amount: "−$120.00", type: "out", state: "Active" },
  { title: "Referral earnings", detail: "Tier 1 activity · Oct 27", amount: "+$18.50", type: "in", state: "Completed" },
];

function Brand() {
  return <a href="/pwa" className="dash-brand" aria-label="EchoVest home"><span className="brand-icon-crop"><img src="/echovest-icon.png" alt="" /></span><span>EchoVest</span></a>;
}

function NavLinks({ active, onNavigate }: { active: string; onNavigate?: () => void }) {
  return <nav className="dash-nav" aria-label="Main navigation">
    <p className="dash-nav-label">Workspace</p>
    {navItems.map(({ id, label, icon: Icon }) => <a key={id} href={id === "overview" ? "/dashboard" : `/dashboard?view=${id}`} className={`dash-nav-link ${active === id ? "active" : ""}`} aria-current={active === id ? "page" : undefined} onClick={onNavigate}><Icon size={19} strokeWidth={1.9} /><span>{label}</span>{id === "trading" && <span className="dash-nav-count">2</span>}</a>)}
    <p className="dash-nav-label dash-nav-label-bottom">Account</p>
    <a href="/dashboard?view=settings" className={`dash-nav-link ${active === "settings" ? "active" : ""}`} aria-current={active === "settings" ? "page" : undefined} onClick={onNavigate}><Settings size={19} strokeWidth={1.9} /><span>Settings</span></a>
    <a href="/dashboard?view=help" className={`dash-nav-link ${active === "help" ? "active" : ""}`} aria-current={active === "help" ? "page" : undefined} onClick={onNavigate}><CircleHelp size={19} strokeWidth={1.9} /><span>Help & support</span></a>
  </nav>;
}

function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="dash-page-heading"><div><p className="dash-kicker">YOUR ACCOUNT</p><h1>{title}</h1><p className="dash-subtitle">{subtitle}</p></div><span className="dash-preview-tag"><i /> Preview data</span><a className="dash-page-mobile-notification" href="/dashboard?view=notifications" aria-label="Open notifications"><Bell size={21} /><i /></a></div>;
}

function ActivityList() {
  return <div className="dash-activity-list">{recentActivity.map((item) => <div className="dash-activity-row" key={item.title}>
    <span className={`dash-activity-icon ${item.type}`} aria-hidden="true">{item.type === "in" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span>
    <span className="dash-activity-main"><b>{item.title}</b><small>{item.detail}</small></span>
    <span className="dash-activity-amount"><b className={item.type}>{item.amount}</b><small>{item.state}</small></span>
  </div>)}</div>;
}

function Overview({ email, name }: { email: string; name: string }) {
  return <>
    <MobileHome email={email} name={name} />
    <div className="dash-desktop-overview">
    <PageHeading title="Your overview" subtitle="A quick look at your wallet and trading activity." />
    <section className="dash-stat-grid" aria-label="Account summary">
      <article className="dash-balance-card"><div className="dash-balance-top"><span>Total wallet balance</span><Wallet size={19} /></div><strong>$12,480<span>.50</span></strong><p><span className="dash-sample-dot" /> Sample account value</p><div className="dash-balance-footer"><span>Wallet</span><span>Referral earnings included</span></div></article>
      <article className="dash-stat-card"><span className="dash-stat-icon teal"><Users size={19} /></span><small>Referral earnings</small><strong>$320.00</strong><span className="dash-stat-caption">Held in a separate balance</span><a href="/dashboard?view=referrals">View referrals <ArrowRight size={14} /></a></article>
      <article className="dash-stat-card"><span className="dash-stat-icon blue"><Zap size={19} /></span><small>Copying now</small><strong>2 <em>strategies</em></strong><span className="dash-stat-caption">You control when to pause</span><a href="/dashboard?view=trading">View strategies <ArrowRight size={14} /></a></article>
      <article className="dash-stat-card"><span className="dash-stat-icon violet"><Award size={19} /></span><small>Membership level</small><strong>Blue</strong><span className="dash-stat-caption">Your current level</span><a href="/dashboard?view=levels">View level <ArrowRight size={14} /></a></article>
    </section>

    <section className="dash-content-grid">
      <article className="dash-panel dash-activity-panel"><div className="dash-panel-heading"><div><h2>Recent activity</h2><p>Latest wallet and account updates</p></div><a href="/dashboard?view=transactions">All activity <ArrowRight size={15} /></a></div><ActivityList /></article>
      <article className="dash-panel dash-signals-panel"><div className="dash-panel-heading"><div><h2>Copy trading</h2><p>Your active strategies</p></div><span className="dash-soft-count">02 active</span></div>
        <div className="dash-strategy"><span className="dash-coin-mark">₿</span><div><b>BTC Trend Strategy</b><small>Allocation · $120.00</small></div><span className="dash-status"><i /> Copying</span></div>
        <div className="dash-strategy"><span className="dash-coin-mark eth">Ξ</span><div><b>ETH Momentum</b><small>Allocation · $80.00</small></div><span className="dash-status"><i /> Copying</span></div>
        <a className="dash-panel-link" href="/dashboard?view=trading">Manage strategies <ArrowRight size={15} /></a>
      </article>
    </section>
    <div className="dash-disclosure"><ShieldCheck size={17} /><span>Copy trading involves risk, including the potential loss of funds. Past performance does not guarantee future results.</span></div>
    </div>
  </>;
}

function MobileHome({ email, name }: { email: string; name: string }) {
  const firstName = name.split(/\s+/)[0] || email.split("@")[0]?.split(/[._-]/)[0] || "there";
  return <section className="dash-mobile-home" aria-label="Home overview">
    <header className="dash-mobile-greeting"><div><p>Hello, <strong>{firstName}</strong> <span aria-hidden="true">👋</span></p><small>Welcome back!</small></div><div className="dash-mobile-greeting-actions"><a href="/dashboard?view=levels" className="dash-mobile-level"><Award size={14} /> Blue</a><a href="/dashboard?view=notifications" className="dash-mobile-notification" aria-label="Open notifications"><Bell size={22} /><i /></a></div></header>
    <article className="dash-mobile-balance">
      <div className="dash-mobile-balance-head"><span>Main wallet <i>Sample</i></span><Wallet size={19} /></div>
      <strong>$12,160<span>.50</span></strong>
      <div className="dash-mobile-balance-actions"><a href="/dashboard?view=deposit"><Plus size={16} /> Deposit</a><a href="/dashboard?view=withdraw"><ArrowUpRight size={16} /> Withdraw</a></div>
    </article>
    <div className="dash-mobile-summary">
      <a href="/dashboard?view=referrals"><span className="dash-mobile-summary-icon"><Users size={17} /></span><small>Referral earnings</small><strong>$320.00</strong></a>
      <a href="/dashboard?view=trading"><span className="dash-mobile-summary-icon"><Zap size={17} /></span><small>Copying now</small><strong>2 strategies</strong></a>
    </div>
    <nav className="dash-mobile-shortcuts" aria-label="Quick actions">
      <a href="/dashboard?view=trading"><span><Zap size={19} /></span>Trade</a>
      <a href="/dashboard?view=wallet"><span><ShieldCheck size={19} /></span>Vault</a>
      <a href="/dashboard?view=referrals"><span><Users size={19} /></span>Referral</a>
    </nav>
    <BtcMarketChart />
    <article className="dash-mobile-activity"><div><h2>Recent activity</h2><a href="/dashboard?view=transactions">See all <ArrowRight size={14} /></a></div><div className="dash-mobile-activity-row"><span className="dash-mobile-activity-icon"><ArrowDownLeft size={17} /></span><span><b>Deposit credited</b><small>Today · Sample activity</small></span><strong>+$500.00</strong></div></article>
    <p className="dash-mobile-disclosure">Preview figures only. Copy trading involves risk.</p>
  </section>;
}

function WalletView() {
  return <><PageHeading title="Wallet" subtitle="Review your balances and recent wallet activity." /><div className="dash-subview-stats"><article className="dash-panel"><span className="dash-overline">MAIN WALLET · SAMPLE</span><strong className="dash-large-value">$12,160.50</strong><p>Deposits, allocations, and withdrawals</p><div className="dash-wallet-actions"><a className="dash-outline-button" href="/dashboard?view=deposit">Deposit funds <ArrowRight size={15} /></a><a className="dash-outline-button" href="/dashboard?view=withdraw">Withdraw funds <ArrowRight size={15} /></a></div></article><article className="dash-panel"><span className="dash-overline">REFERRAL EARNINGS · SAMPLE</span><strong className="dash-large-value">$320.00</strong><p>Shown separately from your main wallet</p><a className="dash-outline-button" href="/dashboard?view=referrals">Referral details <ArrowRight size={15} /></a></article></div><article className="dash-panel dash-full-panel"><div className="dash-panel-heading"><div><h2>Wallet activity</h2><p>Example transaction history</p></div><a href="/dashboard?view=transactions">See all <ArrowRight size={15} /></a></div><ActivityList /></article></>;
}

function TradingView() {
  return <><PageHeading title="Copy trading" subtitle="Review the strategies you are following." /><div className="dash-notice"><Sparkles size={18} /><span>Copying is always under your control. Pause, resume, or stop a strategy at any time.</span></div><div className="dash-strategy-grid">{[["₿", "BTC Trend Strategy", "Bitcoin · Moderate", "$120.00"], ["Ξ", "ETH Momentum", "Ethereum · Balanced", "$80.00"]].map(([mark, name, meta, allocation]) => <article className="dash-panel dash-strategy-card" key={name}><div className="dash-strategy-title"><span className={`dash-coin-mark ${mark === "Ξ" ? "eth" : ""}`}>{mark}</span><span><b>{name}</b><small>{meta}</small></span><span className="dash-status"><i /> Active</span></div><div className="dash-strategy-details"><span>Allocation<strong>{allocation}</strong></span><span>Copy status<strong className="dash-green-text">Running</strong></span></div><div className="dash-strategy-foot">Performance details will appear here as account data becomes available.</div></article>)}</div><p className="dash-risk-note">Trading involves risk, and losses are possible. These strategy examples are for interface preview only.</p></>;
}

function ReferralsView() {
  const [copied, setCopied] = useState(false);
  const referralLink = "echovest.app/join/EV-DEMO";
  async function copyLink() {
    try { await navigator.clipboard.writeText(referralLink); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); }
  }
  return <><PageHeading title="Referrals" subtitle="Share your referral link and follow activity across your network." /><article className="dash-referral-banner"><div><span className="dash-overline">YOUR REFERRAL LINK · SAMPLE</span><strong>{referralLink}</strong><small>Referral terms and commission rates will be shown when confirmed.</small></div><button type="button" onClick={copyLink} className="dash-copy-button">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy link"}</button></article><section className="dash-stat-grid dash-referral-stats"><article className="dash-stat-card"><small>Network members</small><strong>8</strong><span className="dash-stat-caption">Sample count · up to 3 tiers</span></article><article className="dash-stat-card"><small>Referral earnings</small><strong>$320.00</strong><span className="dash-stat-caption">Sample balance</span></article><article className="dash-stat-card"><small>Direct referrals</small><strong>5</strong><span className="dash-stat-caption">Sample count</span></article></section><article className="dash-panel dash-full-panel"><div className="dash-panel-heading"><div><h2>Your network</h2><p>Sample names and commission earned from each person</p></div></div><div className="dash-network-list">{[["AM", "Amara M.", "Tier 1", "$182.00"], ["TO", "Tunde O.", "Tier 1", "$96.50"], ["KI", "Kemi I.", "Tier 2", "$41.50"]].map(([initials, name, tier, earned]) => <div className="dash-network-row" key={name}><span className="dash-avatar-small">{initials}</span><b>{name}</b><span>{tier}</span><strong>{earned}</strong></div>)}</div></article></>;
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

function TransactionsView() {
  return <><PageHeading title="Transactions" subtitle="Review example deposits, allocations, and referral earnings." /><article className="dash-panel dash-full-panel"><div className="dash-panel-heading"><div><h2>All activity</h2><p>Example entries · preview only</p></div><button type="button" className="dash-filter-button">All activity <ChevronDown size={15} /></button></div><ActivityList /></article></>;
}

function SettingsView({ email, name }: { email: string; name: string }) {
  return <><PageHeading title="Settings" subtitle="Manage your account preferences." /><article className="dash-panel dash-settings-card"><div className="dash-profile-large">{name.slice(0, 1).toUpperCase() || email.slice(0, 1).toUpperCase() || "U"}</div><div><span className="dash-overline">SIGNED IN AS</span><h2>{name || email}</h2><p>{email}</p></div></article><article className="dash-panel dash-full-panel dash-security-note"><ShieldCheck size={20} /><div><b>Account security</b><p>Your account uses a protected server session.</p></div></article><a className="dash-outline-button dash-mobile-help-link" href="/dashboard?view=help">Help &amp; support <ArrowRight size={15} /></a></>;
}

function HelpView() {
  return <><PageHeading title="Help & support" subtitle="Quick answers for the main areas of your EchoVest account." /><div className="dash-help-grid">{[["Account access", "Sign-in and account recovery options will appear here."], ["Wallet and transactions", "Learn how deposits, withdrawals, and status updates work."], ["Copy trading", "Review how to choose an allocation and manage copied strategies."], ["Referral network", "Understand your referral tiers and earnings summary."]].map(([title, copy]) => <article className="dash-panel" key={title}><span className="dash-help-icon"><CircleHelp size={18} /></span><h2>{title}</h2><p>{copy}</p></article>)}</div><div className="dash-disclosure"><CircleHelp size={17} /><span>Support contact details will be added when the support channel is confirmed.</span></div></>;
}

function NotificationsView() {
  const items = [
    { icon: Wallet, title: "Deposit credited", detail: "Your USDT deposit is confirmed and available in your wallet.", time: "Today · Sample update", type: "success" },
    { icon: Zap, title: "Copy trading is active", detail: "BTC Trend Strategy is currently copying in your account.", time: "Yesterday · Sample update", type: "neutral" },
    { icon: Users, title: "Referral earnings updated", detail: "Your referral earnings are tracked separately from your main wallet.", time: "Oct 27 · Sample update", type: "neutral" },
  ];
  return <><PageHeading title="Notifications" subtitle="Important wallet and account information." /><section className="dash-notifications-list" aria-label="Recent notifications">{items.map(({ icon: Icon, title, detail, time, type }) => <article className="dash-panel dash-notification-item" key={title}><span className={`dash-notification-icon ${type}`}><Icon size={18} /></span><div><strong>{title}</strong><p>{detail}</p><small>{time}</small></div><i aria-label="Unread" /></article>)}</section><p className="dash-notification-preview-note">These notification examples are sample data. Account alerts will appear here once connected.</p></>;
}

export function Dashboard({ initialView = "overview" }: { initialView?: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = navItems.some((item) => item.id === initialView) || ["settings", "help", "deposit", "withdraw", "notifications"].includes(initialView) ? initialView : "overview";
  useEffect(() => {
    let active = true;
    authRequest<{ user: AuthUser }>("me").then(({ user }) => {
      if (!active) return;
      setEmail(user.email);
      setUserName(user.fullName);
      setReady(true);
    }).catch(() => { if (active) router.replace("/sign-in"); });
    return () => { active = false; };
  }, [router]);
  async function signOut() {
    try { await authRequest("signout", {}); } finally { router.replace("/sign-in"); }
  }
  if (!ready) return <main className="dash-loading"><span className="brand-icon-crop"><img src="/echovest-icon.png" alt="" /></span><p>Opening your preview…</p></main>;
  const activeContent = active === "wallet" ? <WalletView /> : active === "deposit" ? <DepositView /> : active === "withdraw" ? <WithdrawalView /> : active === "notifications" ? <NotificationsView /> : active === "trading" ? <TradingView /> : active === "referrals" ? <ReferralsView /> : active === "levels" ? <LevelsView /> : active === "transactions" ? <TransactionsView /> : active === "settings" ? <SettingsView email={email} name={userName} /> : active === "help" ? <HelpView /> : <Overview email={email} name={userName} />;
  const initials = userName ? userName.slice(0, 1).toUpperCase() : email ? email.slice(0, 1).toUpperCase() : "U";
  return <div className="dash-app">
    <aside className="dash-sidebar"><Brand /><NavLinks active={active} /><div className="dash-sidebar-bottom"><div className="dash-help-card"><span><ShieldCheck size={17} /></span><b>Your account, protected</b><small>Security features are coming soon.</small></div><button type="button" className="dash-signout" onClick={signOut}><LogOut size={18} />Sign out</button></div></aside>
    {mobileOpen && <div className="dash-mobile-backdrop" onClick={() => setMobileOpen(false)} />}
    <aside className={`dash-mobile-sidebar ${mobileOpen ? "open" : ""}`} aria-hidden={!mobileOpen}><div className="dash-mobile-sidebar-head"><Brand /><button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={20} /></button></div><NavLinks active={active} onNavigate={() => setMobileOpen(false)} /><button type="button" className="dash-signout" onClick={signOut}><LogOut size={18} />Sign out</button></aside>
    <div className="dash-main"><header className="dash-topbar"><button type="button" className="dash-mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><div className="dash-crumb">Workspace <span>/</span> {formatView(active)}</div><div className="dash-topbar-actions"><span className="dash-topbar-demo">Demo preview</span><button type="button" className="dash-icon-button" aria-label="Notifications"><Bell size={18} /><i /></button><span className="dash-user-separator" /><a className="dash-user-button" href="/dashboard?view=settings"><span className="dash-user-avatar">{initials}</span><span className="dash-user-name">{userName || email}</span><ChevronDown size={15} /></a></div></header>
      <main className="dash-page"><div className="dash-hello"><div><p>Good to see you</p><h2>Welcome back<span>.</span></h2></div><p className="dash-preview-caption">All figures shown are sample data</p></div>{activeContent}</main>
      <nav className="dash-bottom-nav" aria-label="Quick navigation">{[{ id: "overview", label: "Home", icon: Home }, { id: "trading", label: "Trade", icon: Zap }, { id: "wallet", label: "Vault", icon: ShieldCheck }, { id: "transactions", label: "History", icon: ReceiptText }, { id: "settings", label: "Profile", icon: User }].map(({ id, label, icon: Icon }) => <a href={id === "overview" ? "/dashboard" : `/dashboard?view=${id}`} key={id} className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined}><Icon size={20} /><span>{label}</span></a>)}</nav>
    </div>
  </div>;
}
