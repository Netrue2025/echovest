"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, Bell, ChevronDown,
  CircleDollarSign, ClipboardList, Download, LayoutDashboard, Search,
  Settings2, ShieldCheck, Signal, UserRound, Users, Wallet, type LucideIcon,
} from "lucide-react";

const sections = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: Users },
  { id: "deposits", label: "Deposits", icon: ArrowDownLeft },
  { id: "withdrawals", label: "Withdrawals", icon: ArrowUpRight },
  { id: "wallets", label: "Wallets", icon: Wallet },
  { id: "signals", label: "Copy signals", icon: Signal },
  { id: "referrals", label: "Referrals & levels", icon: UserRound },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "audit", label: "Audit log", icon: ClipboardList },
  { id: "roles", label: "Admin roles", icon: ShieldCheck },
];

const records = [
  { category: "Deposits", name: "Jeremiah O.", detail: "USDT · Address not configured", amount: "$500.00", status: "Pending" },
  { category: "Withdrawals", name: "Amara M.", detail: "USDT · Destination pending", amount: "$180.00", status: "Review" },
  { category: "Users", name: "Tunde O.", detail: "tunde@example.com · Blue", amount: "—", status: "Active" },
  { category: "Wallets", name: "Wallet provisioning", detail: "Assigned addresses · provider not connected", amount: "—", status: "Pending" },
  { category: "Copy signals", name: "BTC Trend Strategy", detail: "24 sample copiers · status preview", amount: "—", status: "Active" },
  { category: "Referrals", name: "Network commissions", detail: "Tier 1–3 · sample payout totals", amount: "$8,940", status: "Active" },
  { category: "Admin roles", name: "Finance Admin", detail: "Withdrawal review · example role", amount: "—", status: "Active" },
  { category: "Audit log", name: "Level updated", detail: "Admin preview · sample audit event", amount: "—", status: "Logged" },
  { category: "Deposits", name: "Kemi I.", detail: "USDT · Awaiting confirmation", amount: "$1,200.00", status: "Confirming" },
];

const sectionCopy: Record<string, string> = {
  overview: "Platform activity at a glance.", users: "Search accounts and review membership status.", deposits: "Track incoming payments and blockchain confirmations.",
  withdrawals: "Review requests against the 1–24 hour processing window.", wallets: "Monitor issued deposit addresses and wallet status.", signals: "Manage published strategies and copier counts.",
  referrals: "Review network activity and membership progression.", reports: "Prepare platform activity reports.", audit: "Review administrative actions and system events.", roles: "Review administrator accounts and permission scopes.",
};

function Metric({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note: string }) {
  return <article className="admin-metric"><span><Icon size={18} /></span><small>{label}</small><strong>{value}</strong><p>{note}</p></article>;
}

export function AdminDashboard() {
  const [section, setSection] = useState("overview");
  const [query, setQuery] = useState("");
  const current = sections.find((item) => item.id === section) ?? sections[0];
  const visibleRecords = useMemo(() => records.filter((item) => {
    const matchesSearch = `${item.name} ${item.detail} ${item.status}`.toLowerCase().includes(query.toLowerCase());
    const matchesSection = section === "overview" || section === "reports" ||
      (section === "users" && item.category === "Users") || (section === "audit" && item.category === "Audit log") ||
      (section === "deposits" && item.category === "Deposits") || (section === "withdrawals" && item.category === "Withdrawals") ||
      (section === "referrals" && item.category === "Referrals") || (section === "wallets" && item.category === "Wallets") ||
      (section === "signals" && item.category === "Copy signals") || (section === "roles" && item.category === "Admin roles");
    return matchesSearch && matchesSection;
  }), [query, section]);

  return <div className="admin-app">
    <aside className="admin-sidebar"><a className="admin-brand" href="/dashboard"><span><BarChart3 size={20} /></span>EchoVest <small>ADMIN</small></a><nav className="admin-nav" aria-label="Admin navigation">{sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={section === id ? "active" : ""} onClick={() => setSection(id)}><Icon size={18} /><span>{label}</span>{id === "deposits" && <i>2</i>}</button>)}</nav><div className="admin-sidebar-foot"><ShieldCheck size={17} /><span>Admin security controls required before production use.</span></div></aside>
    <main className="admin-main">
      <header className="admin-topbar"><div><span>ADMIN CONSOLE</span><b>{current.label}</b></div><div><span className="admin-preview-pill">Demo data</span><button aria-label="Notifications" type="button"><Bell size={18} /><i /></button><span className="admin-avatar">A</span><span className="admin-user-label">Admin preview</span><ChevronDown size={15} /></div></header>
      <section className="admin-content">
        <div className="admin-heading"><div><p>PLATFORM MANAGEMENT</p><h1>{section === "overview" ? "Good morning, Admin" : current.label}</h1><span>{sectionCopy[section]}</span></div><a href="/dashboard"><ArrowRight size={15} /> User app</a></div>
        <div className="admin-preview-warning"><ShieldCheck size={17} /><span>This is a frontend preview with sample figures. No account, wallet, approval, or signal changes are applied.</span></div>
        {section === "overview" && <div className="admin-metrics">
          <Metric icon={Users} label="Total users" value="2,481" note="Sample registered accounts" />
          <Metric icon={ArrowDownLeft} label="Total deposits" value="$184,250" note="Sample ledger volume" />
          <Metric icon={ArrowUpRight} label="Total withdrawals" value="$62,430" note="Sample ledger volume" />
          <Metric icon={Signal} label="Active signals" value="8" note="3,120 sample copiers" />
          <Metric icon={CircleDollarSign} label="Referral payouts" value="$8,940" note="Across sample referral tiers" />
        </div>}
        <div className="admin-overview-grid">
          {section === "overview" && <article className="admin-panel admin-growth"><div className="admin-panel-head"><div><h2>Platform growth</h2><p>Illustrative activity · last 7 days</p></div><button type="button" disabled>7 days <ChevronDown size={14} /></button></div><div className="admin-chart-legend"><span><i />New users</span><span><i />Deposit volume</span></div><div className="admin-chart" aria-label="Illustrative growth chart"><svg viewBox="0 0 700 190" preserveAspectRatio="none"><path className="grid" d="M0 30H700M0 75H700M0 120H700M0 165H700"/><path className="users" d="M0 142 C50 126 55 148 100 119 S150 130 200 96 S260 122 310 91 S375 99 420 68 S490 91 530 52 S610 64 650 28 S675 40 700 18"/><path className="deposits" d="M0 162 C50 155 60 130 100 140 S155 119 200 127 S260 91 310 110 S370 78 420 91 S475 68 530 81 S600 40 650 55 S670 34 700 42"/></svg><div><span>Oct 24</span><span>Oct 25</span><span>Oct 26</span><span>Oct 27</span><span>Oct 28</span><span>Oct 29</span><span>Oct 30</span></div></div></article>}
          <article className="admin-panel admin-queue"><div className="admin-panel-head"><div><h2>{section === "overview" ? "Needs attention" : `${current.label} activity`}</h2><p>{section === "overview" ? "Sample requests awaiting review" : sectionCopy[section]}</p></div><span className="admin-queue-count">{visibleRecords.length}</span></div>{visibleRecords.length ? visibleRecords.slice(0, 4).map((item, index) => <div className="admin-queue-row" key={`${item.name}-${item.category}`}><span className={`admin-queue-icon type-${index % 3}`}>{item.category === "Deposits" ? <ArrowDownLeft size={16} /> : item.category === "Withdrawals" ? <ArrowUpRight size={16} /> : <UserRound size={16} />}</span><span><strong>{item.name}</strong><small>{item.detail}</small></span><span className="admin-row-value"><b>{item.amount}</b><i className={`status-${item.status.toLowerCase()}`}>{item.status}</i></span></div>) : <div className="admin-empty">No preview records in this section.</div>}</article>
        </div>
        <article className="admin-panel admin-records"><div className="admin-panel-head"><div><h2>{section === "overview" ? "Recent transactions" : `${current.label} records`}</h2><p>Searchable sample records</p></div><div className="admin-record-actions"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records" /></label><button type="button" disabled title="Report export connects with the admin data service"><Download size={15} /> Export</button></div></div><div className="admin-table-wrap"><table><thead><tr><th>Account</th><th>Record</th><th>Amount</th><th>Status</th><th>Updated</th><th /></tr></thead><tbody>{visibleRecords.map((item) => <tr key={`${item.category}-${item.name}`}><td><span className="admin-table-avatar">{item.name.slice(0, 1)}</span><strong>{item.name}</strong></td><td>{item.category}<small>{item.detail}</small></td><td>{item.amount}</td><td><i className={`status-${item.status.toLowerCase()}`}>{item.status}</i></td><td>Today, 10:42</td><td><button type="button" disabled aria-label={`Open ${item.name} record`}>•••</button></td></tr>)}</tbody></table>{!visibleRecords.length && <div className="admin-empty">No matching sample records.</div>}</div></article>
        <p className="admin-footnote"><Settings2 size={14} /> User management, finance approvals, wallet controls, signal publishing, reports and audit actions need role-based access control, mandatory admin 2FA, and a connected backend before they can affect accounts.</p>
      </section>
    </main>
  </div>;
}
