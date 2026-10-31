"use client";

import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Award, Bell, ChevronDown,
  CircleHelp, Crown, Gem, Home, LogOut, Medal, Menu, ReceiptText, Settings, ShieldCheck,
  Sparkles, Users, Wallet, X, Zap, User, Plus,
} from "lucide-react";
import { type MouseEvent as ReactMouseEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BtcMarketChart } from "../components/BtcMarketChart";
import { DepositView } from "./DepositView";
import { WithdrawalView } from "./WithdrawalView";
import { authRequest, AuthUser } from "../lib/auth-api";
import { AppPreloader } from "../components/AppPreloader";
import loadingStyles from "../components/AppPreloader.module.css";
import { financeRequest, FinanceSummary, FinanceTransaction } from "../lib/finance-api";

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
const money = (amount: number) => `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })} USDT`;
const emptyFinance: FinanceSummary = { balances: { trading: 0, referral: 0, availableTrading: 0, availableReferral: 0 }, transactions: [] };

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
  return <div className="dash-page-heading"><div><p className="dash-kicker">YOUR ACCOUNT</p><h1>{title}</h1><p className="dash-subtitle">{subtitle}</p></div><a className="dash-page-mobile-notification" href="/dashboard?view=notifications" aria-label="Open notifications"><Bell size={21} /><i /></a></div>;
}

function ActivityList({ transactions = [] }: { transactions?: FinanceTransaction[] }) {
  if (!transactions.length) return <p className="dash-deposit-helper">No account activity yet.</p>;
  return <div className="dash-activity-list">{transactions.map((item) => <div className="dash-activity-row" key={item.id}>
    <span className={`dash-activity-icon ${item.type === "deposit" ? "in" : "out"}`} aria-hidden="true">{item.type === "deposit" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span>
    <span className="dash-activity-main"><b>{item.type === "deposit" ? "Deposit" : "Withdrawal"}</b><small>{item.network} - {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}</small></span>
    <span className="dash-activity-amount"><b className={item.type === "deposit" ? "in" : "out"}>{item.type === "deposit" ? "+" : "-"}{money(item.amount)}</b><small>{item.status.replaceAll("_", " ")}</small></span>
  </div>)}</div>;
}

function Overview({ email, name, finance }: { email: string; name: string; finance: FinanceSummary }) {
  return <>
    <MobileHome email={email} name={name} finance={finance} />
    <div className="dash-desktop-overview">
    <PageHeading title="Your overview" subtitle="A quick look at your wallet and trading activity." />
    <section className="dash-stat-grid" aria-label="Account summary">
      <article className="dash-balance-card"><div className="dash-balance-top"><span>Total wallet balance</span><Wallet size={19} /></div><strong>{money(finance.balances.availableTrading + finance.balances.availableReferral)}</strong><p><span className="dash-sample-dot" /> Available balance</p><div className="dash-balance-footer"><span>Investment {money(finance.balances.availableTrading)}</span><span>Referral {money(finance.balances.availableReferral)}</span></div></article>
      <article className="dash-stat-card"><span className="dash-stat-icon teal"><Users size={19} /></span><small>Referral earnings</small><strong>{money(finance.balances.availableReferral)}</strong><span className="dash-stat-caption">Held in a separate balance</span><a href="/dashboard?view=referrals">View referrals <ArrowRight size={14} /></a></article>
      <article className="dash-stat-card"><span className="dash-stat-icon blue"><Zap size={19} /></span><small>Copying now</small><strong>0 <em>strategies</em></strong><span className="dash-stat-caption">No active strategy allocations</span><a href="/dashboard?view=trading">View strategies <ArrowRight size={14} /></a></article>
      <article className="dash-stat-card"><span className="dash-stat-icon violet"><Award size={19} /></span><small>Membership level</small><strong>Blue</strong><span className="dash-stat-caption">Your current level</span><a href="/dashboard?view=levels">View level <ArrowRight size={14} /></a></article>
    </section>

    <section className="dash-content-grid">
      <article className="dash-panel dash-activity-panel"><div className="dash-panel-heading"><div><h2>Recent activity</h2><p>Latest wallet updates</p></div><a href="/dashboard?view=transactions">All activity <ArrowRight size={15} /></a></div><ActivityList transactions={finance.transactions.slice(0, 4)} /></article>
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
    <header className="dash-mobile-greeting"><div><p>Hello, <strong>{firstName}</strong> <span aria-hidden="true">👋</span></p><small>Welcome back!</small></div><div className="dash-mobile-greeting-actions"><a href="/dashboard?view=levels" className="dash-mobile-level"><Award size={14} /> Blue</a><a href="/dashboard?view=notifications" className="dash-mobile-notification" aria-label="Open notifications"><Bell size={22} /><i /></a></div></header>
    <article className="dash-mobile-balance">
      <div className="dash-mobile-balance-head"><span>Main wallet</span><Wallet size={19} /></div>
      <strong>{money(finance.balances.availableTrading)}</strong>
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
    <article className="dash-mobile-activity"><div><h2>Recent activity</h2><a href="/dashboard?view=transactions">See all <ArrowRight size={14} /></a></div>{finance.transactions[0] ? <div className="dash-mobile-activity-row"><span className="dash-mobile-activity-icon"><ArrowDownLeft size={17} /></span><span><b>{finance.transactions[0].type === "deposit" ? "Deposit" : "Withdrawal"}</b><small>{finance.transactions[0].status.replaceAll("_", " ")}</small></span><strong>{money(finance.transactions[0].amount)}</strong></div> : <p className="dash-deposit-helper">No transactions yet.</p>}</article>
    <p className="dash-mobile-disclosure">Account balances update after approved transactions.</p>
  </section>;
}

function WalletView({ finance }: { finance: FinanceSummary }) {
  return <><PageHeading title="Wallet" subtitle="Review your balances and recent wallet activity." /><div className="dash-subview-stats"><article className="dash-panel"><span className="dash-overline">INVESTMENT BALANCE</span><strong className="dash-large-value">{money(finance.balances.availableTrading)}</strong><p>Deposits are credited after admin approval</p><div className="dash-wallet-actions"><a className="dash-outline-button" href="/dashboard?view=deposit">Deposit funds <ArrowRight size={15} /></a><a className="dash-outline-button" href="/dashboard?view=withdraw">Withdraw funds <ArrowRight size={15} /></a></div></article><article className="dash-panel"><span className="dash-overline">REFERRAL BALANCE</span><strong className="dash-large-value">{money(finance.balances.availableReferral)}</strong><p>Shown separately from your investment balance</p><a className="dash-outline-button" href="/dashboard?view=referrals">Referral details <ArrowRight size={15} /></a></article></div><article className="dash-panel dash-full-panel"><div className="dash-panel-heading"><div><h2>Wallet activity</h2><p>Deposit and withdrawal requests</p></div><a href="/dashboard?view=transactions">See all <ArrowRight size={15} /></a></div><ActivityList transactions={finance.transactions} /></article></>;
}

function TradingView() {
  return <><PageHeading title="Copy trading" subtitle="Review the strategies you are following." /><div className="dash-notice"><Sparkles size={18} /><span>Copying is always under your control. Pause, resume, or stop a strategy at any time.</span></div><article className="dash-panel dash-full-panel"><h2>No active strategies</h2><p className="dash-deposit-helper">Available copy-trading strategies will appear here when configured.</p></article><p className="dash-risk-note">Trading involves risk, and losses are possible.</p></>;
}

function ReferralsView({ balance }: { balance: number }) {
  return <><PageHeading title="Referrals" subtitle="Your referral rewards and network activity." /><section className="dash-stat-grid dash-referral-stats"><article className="dash-stat-card"><small>Referral balance</small><strong>{money(balance)}</strong><span className="dash-stat-caption">Approved referral credits</span></article></section><article className="dash-panel dash-full-panel"><div className="dash-panel-heading"><div><h2>Your referral link</h2><p>Your unique invite link will appear when referrals are enabled.</p></div></div><p className="dash-deposit-helper">Referral activity will appear here when real referral accounts join.</p></article></>;
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

function NotificationsView() {
  return <><PageHeading title="Notifications" subtitle="Important wallet and account information." /><article className="dash-panel dash-full-panel"><h2>No new notifications</h2><p className="dash-deposit-helper">Deposit and withdrawal status updates will appear here when notification delivery is enabled.</p></article></>;
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
  const activeContent = active === "wallet" ? <WalletView finance={finance} /> : active === "deposit" ? <DepositView /> : active === "withdraw" ? <WithdrawalView /> : active === "notifications" ? <NotificationsView /> : active === "trading" ? <TradingView /> : active === "referrals" ? <ReferralsView balance={finance.balances.referral} /> : active === "levels" ? <LevelsView /> : active === "transactions" ? <TransactionsView finance={finance} /> : active === "settings" ? <SettingsView email={email} name={userName} onSignOut={signOut} /> : active === "help" ? <HelpView /> : <Overview email={email} name={userName} finance={finance} />;
  const initials = userName ? userName.slice(0, 1).toUpperCase() : email ? email.slice(0, 1).toUpperCase() : "U";
  return <div className="dash-app" onClick={navigateWithinDashboard}>
    {signingOut && <AppPreloader label="Signing out…" />}
    <aside className="dash-sidebar"><Brand /><NavLinks active={active} /><div className="dash-sidebar-bottom"><div className="dash-help-card"><span><ShieldCheck size={17} /></span><b>Your account, protected</b><small>Security features are coming soon.</small></div><button type="button" className="dash-signout" onClick={signOut}><LogOut size={18} />Sign out</button></div></aside>
    {mobileOpen && <div className="dash-mobile-backdrop" onClick={() => setMobileOpen(false)} />}
    <aside className={`dash-mobile-sidebar ${mobileOpen ? "open" : ""}`} aria-hidden={!mobileOpen}><div className="dash-mobile-sidebar-head"><Brand /><button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={20} /></button></div><NavLinks active={active} onNavigate={() => setMobileOpen(false)} /></aside>
    <div className="dash-main"><header className="dash-topbar"><button type="button" className="dash-mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><div className="dash-crumb">Workspace <span>/</span> {formatView(active)}</div><div className="dash-topbar-actions"><button type="button" className="dash-icon-button" aria-label="Notifications"><Bell size={18} /><i /></button><span className="dash-user-separator" /><a className="dash-user-button" href="/dashboard?view=settings"><span className="dash-user-avatar">{initials}</span><span className="dash-user-name">{userName || email}</span><ChevronDown size={15} /></a></div></header>
      <main className="dash-page"><div className="dash-hello"><div><p>Good to see you</p><h2>Welcome back<span>.</span></h2></div></div><div key={active} className={loadingStyles.sectionEnter}>{activeContent}</div></main>
      <nav className="dash-bottom-nav" aria-label="Quick navigation">{[{ id: "overview", label: "Home", icon: Home }, { id: "trading", label: "Trade", icon: Zap }, { id: "wallet", label: "Vault", icon: ShieldCheck }, { id: "transactions", label: "History", icon: ReceiptText }, { id: "settings", label: "Profile", icon: User }].map(({ id, label, icon: Icon }) => <a href={id === "overview" ? "/dashboard" : `/dashboard?view=${id}`} key={id} className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined}><Icon size={20} /><span>{label}</span></a>)}</nav>
    </div>
  </div>;
}
