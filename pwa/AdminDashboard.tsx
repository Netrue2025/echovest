"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, Check, ChevronDown, ClipboardList,
  Download, LayoutDashboard, LockKeyhole, LogOut, Search, ShieldCheck, Signal,
  UserRound, Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import { adminRequest } from "../lib/admin-api";
import { financeRequest } from "../lib/finance-api";

type AdminActor = { id: string; fullName: string; email: string; isSuperAdmin: boolean; permissions: string[] };
type ManagedUser = { id: string; fullName: string; email: string; role: string; isSuperAdmin: boolean; isEmailVerified: boolean; isDisabled: boolean; withdrawalsDisabled: boolean; createdAt?: string };
type ManagedAdmin = { id: string; fullName: string; email: string; permissions: string[]; disabled: boolean; createdAt?: string };
type AuditEvent = { id: string; actorId: string; actorEmail: string; action: string; targetType: string; targetId: string; targetLabel: string; detail: string; createdAt?: string };
type FinanceSettings = { depositWalletAddress: string; depositNetwork: string; depositInstructions: string; minimumDeposit: number; minimumWithdrawal: number };
type FinanceTransaction = { id: string; type: "deposit" | "withdrawal"; amount: number; balanceType: string; status: string; txid: string; network: string; destinationAddress: string; rejectionReason: string; createdAt?: string; user?: { fullName: string; email: string } | null };

const permissionGroups = [
  { id: "dashboard", label: "Dashboard", description: "View platform overview and summary", permissions: [{ code: "dashboard.view", label: "View overview" }] },
  { id: "users", label: "User accounts", description: "Search and manage registered users", permissions: [{ code: "users.view", label: "View users" }, { code: "users.manage", label: "Edit, disable, reset passwords, and delete users" }] },
  { id: "wallets", label: "Wallets and finance", description: "Manage wallet settings and transaction operations", permissions: [{ code: "wallets.view", label: "View wallets and finance settings" }, { code: "wallets.manage", label: "Edit deposit wallet details and transaction limits" }, { code: "deposits.manage", label: "Review and approve deposits" }, { code: "withdrawals.manage", label: "Review withdrawals and manage withdrawal access" }] },
  { id: "trading", label: "Copy trading", description: "Manage copy-trading signals and strategies", permissions: [{ code: "signals.manage", label: "Manage signals" }] },
  { id: "referrals", label: "Referrals and levels", description: "View referral networks and membership levels", permissions: [{ code: "referrals.view", label: "View referrals and levels" }] },
  { id: "oversight", label: "Reports and audit", description: "View reports and administrative audit records", permissions: [{ code: "reports.view", label: "View reports" }, { code: "audit.view", label: "View audit log" }] },
  { id: "administrators", label: "Administrator access", description: "Super-admin only: create administrators and assign section access", permissions: [{ code: "admins.manage", label: "Manage admin accounts (super-admin only)" }] },
];
const sections: { id: string; label: string; icon: LucideIcon; permission: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, permission: "dashboard.view" },
  { id: "users", label: "Users", icon: Users, permission: "users.view" },
  { id: "deposits", label: "Deposits", icon: ArrowDownLeft, permission: "deposits.manage" },
  { id: "withdrawals", label: "Withdrawals", icon: ArrowUpRight, permission: "withdrawals.manage" },
  { id: "wallets", label: "Wallets", icon: Wallet, permission: "wallets.view" },
  { id: "signals", label: "Copy signals", icon: Signal, permission: "signals.manage" },
  { id: "referrals", label: "Referrals & levels", icon: UserRound, permission: "referrals.view" },
  { id: "reports", label: "Reports", icon: BarChart3, permission: "reports.view" },
  { id: "audit", label: "Audit log", icon: ClipboardList, permission: "audit.view" },
  { id: "roles", label: "Admin access", icon: ShieldCheck, permission: "admins.manage" },
];
const sectionCopy: Record<string, string> = {
  overview: "Platform management and account activity.", users: "Review registered accounts and manage account access.", deposits: "Deposit operations and payment status.",
  withdrawals: "Withdrawal operations and user withdrawal access.", wallets: "Wallet settings and account wallet status.", signals: "Published copy-trading signals and strategies.",
  referrals: "Referral networks and membership levels.", reports: "Platform reports and activity summaries.", audit: "Review administrative actions and system events.", roles: "Create admin accounts and assign access to platform sections.",
};
const sectionPlaceholder: Record<string, string> = {
  deposits: "Deposit records will appear here when the deposit ledger is connected.",
  withdrawals: "Withdrawal requests will appear here when withdrawal processing is connected.",
  wallets: "Wallet provisioning and address controls will appear here when the wallet service is connected.",
  signals: "Published strategies and copier controls will appear here when signal management is connected.",
  referrals: "Referral and level records will appear here when referral services are connected.",
  reports: "Reports will be available when platform transaction data is connected.",
  audit: "Administrative actions will appear here after the audit log service is connected.",
};

function LoginForm({ onLogin }: { onLogin: (actor: AdminActor) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const result = await adminRequest<{ user: AdminActor }>("auth/signin", "POST", { email: values.get("email"), password: values.get("password") });
      onLogin(result.user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to sign in to the admin console."); }
    finally { setBusy(false); }
  }
  return <main className="admin-login-shell"><form className="admin-login-card" onSubmit={submit}>
    <div className="admin-login-mark"><ShieldCheck size={25} /></div><p className="admin-login-kicker">ECHOVEST ADMIN</p><h1>Admin sign in</h1><p className="admin-login-copy">Sign in with your administrator account to access the management console.</p>
    <label>Email<input name="email" type="email" autoComplete="username" placeholder="Admin email" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" placeholder="Admin password" required /></label>
    {error && <p className="admin-action-notice error" role="alert">{error}</p>}<button className="admin-primary-button" type="submit" disabled={busy}><LockKeyhole size={15} />{busy ? "Signing in…" : "Sign in securely"}</button>
  </form></main>;
}

function FinanceTable({ title, items, busy, onReview }: { title: string; items: FinanceTransaction[]; busy: boolean; onReview: (item: FinanceTransaction, decision: "approved" | "rejected") => void }) {
  return <article className="admin-panel admin-records"><div className="admin-panel-head"><div><h2>{title}</h2><p>Approve only after confirming the transfer or payout details.</p></div><span>{items.filter((item) => item.status === "network_confirmation" || item.status === "pending_review").length} awaiting review</span></div><div className="admin-table-wrap"><table><thead><tr><th>User</th><th>Amount</th><th>Network / balance</th><th>Address / TXID</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.user?.fullName ?? "Deleted user"}<small>{item.user?.email ?? ""}</small></td><td>{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })} USDT</td><td>{item.type === "withdrawal" ? item.balanceType : item.network}</td><td>{item.type === "deposit" ? item.txid || "No TXID provided" : item.destinationAddress}<small>{item.type === "withdrawal" ? item.network : "Transaction hash"}</small></td><td><i className={item.status === "approved" ? "status-active" : item.status === "rejected" ? "status-review" : "status-pending"}>{item.status.replaceAll("_", " ")}</i>{item.rejectionReason && <small>{item.rejectionReason}</small>}</td><td>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</td><td>{(item.status === "network_confirmation" || item.status === "pending_review") ? <><button className="admin-row-manage" type="button" disabled={busy} onClick={() => onReview(item, "approved")}>Approve</button><button className="admin-inline-action" type="button" disabled={busy} onClick={() => onReview(item, "rejected")}>Reject</button></> : "Reviewed"}</td></tr>)}</tbody></table>{!items.length && <div className="admin-empty">No requests have been submitted yet.</div>}</div></article>;
}

export function AdminDashboard() {
  const [actor, setActor] = useState<AdminActor | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [section, setSection] = useState("overview");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [admins, setAdmins] = useState<ManagedAdmin[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [selectedAdmin, setSelectedAdmin] = useState<ManagedAdmin | null>(null);
  const [newAdminOpen, setNewAdminOpen] = useState(false);
  const [newPermissions, setNewPermissions] = useState<string[]>([]);
  const [financeSettings, setFinanceSettings] = useState<FinanceSettings>({ depositWalletAddress: "", depositNetwork: "", depositInstructions: "", minimumDeposit: 0, minimumWithdrawal: 0 });
  const [deposits, setDeposits] = useState<FinanceTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<FinanceTransaction[]>([]);

  const can = useCallback((permission: string) => Boolean(actor?.isSuperAdmin || actor?.permissions.includes(permission) || (permission === "users.view" && actor?.permissions.includes("users.manage"))), [actor]);
  const loadUsers = useCallback(async () => {
    if (!actor?.isSuperAdmin && !actor?.permissions.some((permission) => permission === "users.view" || permission === "users.manage")) return;
    setUsers(await adminRequest<ManagedUser[]>("users"));
  }, [actor]);
  const loadAdmins = useCallback(async () => {
    if (!actor?.isSuperAdmin) return;
    setAdmins(await adminRequest<ManagedAdmin[]>("admins"));
  }, [actor]);
  const loadAudit = useCallback(async () => {
    if (!actor?.isSuperAdmin && !actor?.permissions.includes("audit.view")) return;
    setAuditEvents(await adminRequest<AuditEvent[]>("audit"));
  }, [actor]);
  const loadFinanceSettings = useCallback(async () => { if (can("wallets.view") || can("wallets.manage")) setFinanceSettings(await financeRequest<FinanceSettings>("admin/settings")); }, [can]);
  const loadDeposits = useCallback(async () => { if (can("deposits.manage")) setDeposits(await financeRequest<FinanceTransaction[]>("admin/deposits")); }, [can]);
  const loadWithdrawals = useCallback(async () => { if (can("withdrawals.manage")) setWithdrawals(await financeRequest<FinanceTransaction[]>("admin/withdrawals")); }, [can]);

  useEffect(() => {
    let active = true;
    adminRequest<{ user: AdminActor }>("auth/me").then((result) => { if (active) setActor(result.user); }).catch(() => undefined).finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!actor) return;
    let active = true;
    Promise.all([loadUsers(), loadAdmins(), loadAudit(), loadFinanceSettings(), loadDeposits(), loadWithdrawals()]).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load admin data."); });
    return () => { active = false; };
  }, [actor, loadUsers, loadAdmins, loadAudit, loadFinanceSettings, loadDeposits, loadWithdrawals]);

  const visibleSections = useMemo(() => sections.filter((item) => item.id === "wallets" ? can("wallets.view") || can("wallets.manage") : item.id !== "roles" ? can(item.permission) : Boolean(actor?.isSuperAdmin)), [can, actor]);
  const current = visibleSections.find((item) => item.id === section) ?? visibleSections[0];
  useEffect(() => { if (current && current.id !== section) setSection(current.id); }, [current, section]);
  const matches = (name: string, email: string, status: string) => `${name} ${email} ${status}`.toLowerCase().includes(query.toLowerCase());
  const filteredUsers = users.filter((user) => matches(user.fullName, user.email, `${user.role} ${user.isDisabled ? "disabled" : "active"}`));
  const filteredAdmins = admins.filter((admin) => matches(admin.fullName, admin.email, admin.disabled ? "disabled" : "active"));

  async function reload() {
    try { await Promise.all([loadUsers(), loadAdmins(), loadAudit(), loadFinanceSettings(), loadDeposits(), loadWithdrawals()]); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh data."); }
  }
  async function action(task: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true); setError(""); setNotice("");
    try { await task(); setNotice(success); await reload(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The requested change could not be saved."); return false; }
    finally { setBusy(false); }
  }
  async function signOut() {
    try { await adminRequest("auth/signout", "POST", {}); } catch { /* Clear the local admin view even if the session already expired. */ }
    setActor(null); setUsers([]); setAdmins([]); setSection("overview");
  }
  if (authLoading) return <main className="admin-loading" aria-busy="true"><span className="admin-loading-orbit" /><p>Checking admin session…</p></main>;
  if (!actor) return <LoginForm onLogin={(admin) => { setActor(admin); setError(""); }} />;
  if (!current) return <main className="admin-loading"><ShieldCheck size={24} /><p>This admin account has no sections enabled yet. Contact the super admin.</p><button className="admin-outline-button" onClick={signOut}>Sign out</button></main>;

  async function updateUserProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedUser) return;
    const data = new FormData(event.currentTarget);
    if (await action(() => adminRequest(`users/${selectedUser.id}`, "PATCH", { fullName: data.get("fullName"), email: data.get("email") }), "User details updated.")) setSelectedUser(null);
  }
  async function updateUserPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedUser) return;
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    await action(() => adminRequest(`users/${selectedUser.id}/password`, "PATCH", { password }), "Password changed and the user’s sessions were revoked.");
  }
  async function createAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (await action(() => adminRequest("admins", "POST", { fullName: data.get("fullName"), email: data.get("email"), password: data.get("password"), permissions: newPermissions }), "Admin account created.")) { setNewAdminOpen(false); setNewPermissions([]); }
  }
  async function saveAdminPermissions() {
    if (!selectedAdmin) return;
    if (await action(() => adminRequest(`admins/${selectedAdmin.id}/permissions`, "PATCH", { permissions: newPermissions }), "Admin access updated.")) setSelectedAdmin(null);
  }
  async function saveFinanceSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = { depositWalletAddress: String(data.get("depositWalletAddress") ?? ""), depositNetwork: String(data.get("depositNetwork") ?? ""), depositInstructions: String(data.get("depositInstructions") ?? ""), minimumDeposit: Number(data.get("minimumDeposit") ?? 0), minimumWithdrawal: Number(data.get("minimumWithdrawal") ?? 0) };
    if (await action(() => financeRequest("admin/settings", "PATCH", payload), "Wallet details and transaction limits saved.")) setFinanceSettings(payload);
  }
  async function reviewFinance(item: FinanceTransaction, decision: "approved" | "rejected") {
    const rejectionReason = decision === "rejected" ? window.prompt("Enter the reason for rejection:")?.trim() : undefined;
    if (decision === "rejected" && !rejectionReason) return;
    const path = item.type === "deposit" ? "deposits" : "withdrawals";
    await action(() => financeRequest(`admin/${path}/${item.id}`, "PATCH", { decision, rejectionReason }), decision === "approved" ? "Request approved and balance updated." : "Request rejected.");
  }
  const setPermission = (code: string) => setNewPermissions((currentPermissions) => currentPermissions.includes(code) ? currentPermissions.filter((item) => item !== code) : [...currentPermissions, code]);

  return <div className="admin-app">
    <aside className="admin-sidebar"><a className="admin-brand" href="/admin"><span><BarChart3 size={20} /></span>EchoVest <small>ADMIN</small></a><nav className="admin-nav" aria-label="Admin navigation">{visibleSections.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={section === id ? "active" : ""} onClick={() => { setSection(id); setQuery(""); }}><Icon size={18} /><span>{label}</span></button>)}</nav><div className="admin-sidebar-foot"><ShieldCheck size={17} /><span>{actor.isSuperAdmin ? "Super admin · all permissions enabled" : `${actor.permissions.length} access permissions enabled`}</span></div></aside>
    <main className="admin-main">
      <header className="admin-topbar"><div><span>ADMIN CONSOLE</span><b>{current.label}</b></div><div><span className="admin-avatar">{actor.fullName.slice(0, 1).toUpperCase()}</span><span className="admin-user-label">{actor.isSuperAdmin ? "Super admin" : actor.fullName}</span><button type="button" className="admin-signout-button" onClick={signOut} aria-label="Sign out"><LogOut size={16} /></button></div></header>
      <section className="admin-content">
        <div className="admin-heading"><div><p>PLATFORM MANAGEMENT</p><h1>{current.id === "overview" ? `Welcome, ${actor.fullName.split(" ")[0]}` : current.label}</h1><span>{sectionCopy[current.id]}</span></div><a href="/dashboard"><ArrowRight size={15} /> User app</a></div>
        {(notice || error) && <p className={`admin-action-notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{error || notice}<button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss message"><X size={15} /></button></p>}
        {current.id === "overview" && <div className="admin-live-overview"><article><span><Users size={18} /></span><small>Registered accounts</small><strong>{can("users.view") ? users.length : "—"}</strong><p>{can("users.view") ? "Live account count" : "User access not assigned"}</p></article><article><span><ShieldCheck size={18} /></span><small>Admin role</small><strong>{actor.isSuperAdmin ? "Super" : "Admin"}</strong><p>{actor.isSuperAdmin ? "Environment configured" : `${actor.permissions.length} enabled sections`}</p></article><article><span><Check size={18} /></span><small>Account access</small><strong>Active</strong><p>Authenticated admin session</p></article></div>}
        {current.id === "users" && <article className="admin-panel admin-records"><div className="admin-panel-head"><div><h2>Registered users</h2><p>{users.length} accounts · user and admin accounts are protected from unauthorized actions</p></div><div className="admin-record-actions"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" /></label><button type="button" onClick={reload} disabled={busy}><Download size={14} /> Refresh</button></div></div><div className="admin-table-wrap"><table><thead><tr><th>Account</th><th>Role</th><th>Email</th><th>Status</th><th>Withdrawals</th><th>Joined</th><th>Manage</th></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id}><td><span className="admin-table-avatar">{user.fullName.slice(0, 1).toUpperCase()}</span><strong>{user.fullName}</strong></td><td>{user.isSuperAdmin ? "Super admin" : user.role}</td><td>{user.email}<small>{user.isEmailVerified ? "Email verified" : "Email unverified"}</small></td><td><i className={user.isDisabled ? "status-review" : "status-active"}>{user.isDisabled ? "Disabled" : "Active"}</i></td><td><i className={user.withdrawalsDisabled ? "status-review" : "status-active"}>{user.withdrawalsDisabled ? "Disabled" : "Enabled"}</i></td><td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</td><td>{(can("users.manage") || can("withdrawals.manage")) && !user.isSuperAdmin && user.role !== "admin" ? <button className="admin-row-manage" type="button" onClick={() => setSelectedUser(user)}>Manage</button> : <span className="admin-protected-label">Protected</span>}</td></tr>)}</tbody></table>{!filteredUsers.length && <div className="admin-empty">No registered users match your search.</div>}</div></article>}
        {current.id === "roles" && actor.isSuperAdmin && <>
          <article className="admin-panel admin-role-create"><div><h2>Administrator accounts</h2><p>Create team admin accounts and assign access to grouped app functions.</p></div><button className="admin-primary-button compact" type="button" onClick={() => { setNewAdminOpen(true); setNewPermissions([]); }}><Users size={15} /> Add administrator</button></article>
        <article className="admin-panel admin-records"><div className="admin-panel-head"><div><h2>Current administrators</h2><p>Super admin access is controlled through environment credentials.</p></div><div className="admin-record-actions"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search administrators" /></label><button type="button" onClick={reload} disabled={busy}>Refresh</button></div></div><div className="admin-table-wrap"><table><thead><tr><th>Administrator</th><th>Email</th><th>Access groups</th><th>Status</th><th>Created</th><th /></tr></thead><tbody>{filteredAdmins.map((admin) => <tr key={admin.id}><td><span className="admin-table-avatar">{admin.fullName.slice(0, 1).toUpperCase()}</span><strong>{admin.fullName}</strong></td><td>{admin.email}</td><td>{admin.permissions.length} permissions</td><td><i className={admin.disabled ? "status-review" : "status-active"}>{admin.disabled ? "Disabled" : "Active"}</i></td><td>{admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : "—"}</td><td><button className="admin-row-manage" type="button" onClick={() => { setSelectedAdmin(admin); setNewPermissions(admin.permissions); }}>Manage access</button><button className="admin-inline-action" type="button" disabled={busy} onClick={async () => { if (await action(() => adminRequest(`admins/${admin.id}/status`, "PATCH", { disabled: !admin.disabled }), admin.disabled ? "Admin account enabled." : "Admin account disabled and signed out.")) { if (selectedAdmin?.id === admin.id) setSelectedAdmin({ ...admin, disabled: !admin.disabled }); } }}>{admin.disabled ? "Enable" : "Disable"}</button></td></tr>)}</tbody></table>{!filteredAdmins.length && <div className="admin-empty">No admin accounts found.</div>}</div></article>
        </>}
        {current.id === "audit" && <article className="admin-panel admin-records"><div className="admin-panel-head"><div><h2>Admin action history</h2><p>Recent user-account and admin-access changes · latest 250 events</p></div><button type="button" onClick={reload} disabled={busy}><Download size={14} /> Refresh</button></div><div className="admin-table-wrap"><table><thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>{auditEvents.map((event) => <tr key={event.id}><td>{event.createdAt ? new Date(event.createdAt).toLocaleString() : "—"}</td><td>{event.actorEmail}</td><td>{event.action.replaceAll(".", " ")}</td><td>{event.targetLabel}<small>{event.targetType}</small></td><td>{event.detail}</td></tr>)}</tbody></table>{!auditEvents.length && <div className="admin-empty">No admin actions have been recorded yet.</div>}</div></article>}
        {current.id === "wallets" && <>
          <form key={JSON.stringify(financeSettings)} className="admin-panel admin-finance-settings" onSubmit={saveFinanceSettings}><div className="admin-panel-head"><div><h2>Deposit wallet and limits</h2><p>Updated limits apply immediately to new user requests.</p></div></div><div className="admin-finance-fields"><label>Deposit wallet address<input name="depositWalletAddress" defaultValue={financeSettings.depositWalletAddress} required disabled={!can("wallets.manage")} /></label><label>Network<input name="depositNetwork" defaultValue={financeSettings.depositNetwork} placeholder="e.g. TRC20" required disabled={!can("wallets.manage")} /></label><label>Minimum deposit (USDT)<input name="minimumDeposit" type="number" min="0" step="any" defaultValue={financeSettings.minimumDeposit} required disabled={!can("wallets.manage")} /></label><label>Minimum withdrawal (USDT)<input name="minimumWithdrawal" type="number" min="0" step="any" defaultValue={financeSettings.minimumWithdrawal} required disabled={!can("wallets.manage")} /></label><label className="wide">Important deposit information<textarea name="depositInstructions" rows={4} defaultValue={financeSettings.depositInstructions} placeholder="Payment instructions and network warnings" disabled={!can("wallets.manage")} /></label></div>{can("wallets.manage") && <button className="admin-primary-button" disabled={busy}>Save finance settings</button>}</form>
        </>}
        {current.id === "deposits" && <FinanceTable title="Deposit requests" items={deposits} onReview={reviewFinance} busy={busy} />}
        {current.id === "withdrawals" && <FinanceTable title="Withdrawal requests" items={withdrawals} onReview={reviewFinance} busy={busy} />}
        {!(["overview", "users", "roles", "audit", "wallets", "deposits", "withdrawals"].includes(current.id)) && <article className="admin-panel admin-module-empty"><span>{current.id === "deposits" ? <ArrowDownLeft /> : current.id === "withdrawals" ? <ArrowUpRight /> : current.id === "wallets" ? <Wallet /> : current.id === "signals" ? <Signal /> : current.id === "referrals" ? <UserRound /> : <BarChart3 />}</span><h2>{current.label}</h2><p>{sectionPlaceholder[current.id] ?? "This module is not connected yet."}</p></article>}
        {current.id === "overview" && <><article className="admin-panel admin-overview-note"><h2>Manage by access group</h2><p>Use Admin access to create administrator accounts and enable only the platform areas each person needs. Access checks are enforced by the backend on every admin request.</p>{permissionGroups.map((group) => <div key={group.id}><strong>{group.label}</strong><span>{group.permissions.map((permission) => permission.label).join(" · ")}</span></div>)}</article></>}
      </section>
    </main>

    {selectedUser && (can("users.manage") || can("withdrawals.manage")) && <div className="admin-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedUser(null); }}><section className="admin-modal-card" key={selectedUser.id} role="dialog" aria-modal="true" aria-labelledby="user-modal-title"><header><div><p>USER ACCOUNT</p><h2 id="user-modal-title">Manage {selectedUser.fullName}</h2></div><button type="button" onClick={() => setSelectedUser(null)} aria-label="Close"><X /></button></header>{can("users.manage") && <><form className="admin-modal-form" onSubmit={updateUserProfile}><label>Full name<input name="fullName" defaultValue={selectedUser.fullName} required minLength={2} maxLength={120} /></label><label>Email<input name="email" type="email" defaultValue={selectedUser.email} required /></label><button className="admin-primary-button" disabled={busy}>Save account details</button></form><form className="admin-modal-form admin-password-form" onSubmit={updateUserPassword}><label>Set a new password<input name="password" type="password" placeholder="12+ characters, uppercase, number, symbol" required minLength={12} maxLength={128} /></label><button className="admin-outline-button" disabled={busy}>Change password</button></form><div className="admin-control-row"><div><strong>Account access</strong><span>{selectedUser.isDisabled ? "Sign-in disabled" : "Sign-in enabled"}</span></div><button type="button" className="admin-outline-button" disabled={busy} onClick={async () => { if (await action(() => adminRequest(`users/${selectedUser.id}/controls`, "PATCH", { disabled: !selectedUser.isDisabled }), selectedUser.isDisabled ? "Account enabled." : "Account disabled and signed out.")) setSelectedUser({ ...selectedUser, isDisabled: !selectedUser.isDisabled }); }}>{selectedUser.isDisabled ? "Enable account" : "Disable account"}</button></div><button type="button" className="admin-danger-button" disabled={busy} onClick={async () => { if (window.confirm(`Permanently delete ${selectedUser.fullName} and revoke their sessions? This cannot be undone.`) && await action(() => adminRequest(`users/${selectedUser.id}`, "DELETE"), "User account deleted.")) setSelectedUser(null); }}>Delete user account</button></>}{can("withdrawals.manage") && <div className="admin-control-row"><div><strong>Withdrawals</strong><span>{selectedUser.withdrawalsDisabled ? "Withdrawals disabled" : "Withdrawals enabled"}</span></div><button type="button" className="admin-outline-button" disabled={busy} onClick={async () => { if (await action(() => adminRequest(`users/${selectedUser.id}/withdrawals`, "PATCH", { withdrawalsDisabled: !selectedUser.withdrawalsDisabled }), selectedUser.withdrawalsDisabled ? "Withdrawals enabled." : "Withdrawals disabled.")) setSelectedUser({ ...selectedUser, withdrawalsDisabled: !selectedUser.withdrawalsDisabled }); }}>{selectedUser.withdrawalsDisabled ? "Enable withdrawals" : "Disable withdrawals"}</button></div>}</section></div>}

    {(newAdminOpen || selectedAdmin) && actor.isSuperAdmin && <div className="admin-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) { setNewAdminOpen(false); setSelectedAdmin(null); } }}><section className="admin-modal-card admin-access-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title"><header><div><p>ADMIN ACCESS</p><h2 id="admin-modal-title">{selectedAdmin ? `Access for ${selectedAdmin.fullName}` : "Create admin account"}</h2></div><button type="button" onClick={() => { setNewAdminOpen(false); setSelectedAdmin(null); }} aria-label="Close"><X /></button></header>{newAdminOpen && <form className="admin-modal-form" id="create-admin-form" onSubmit={createAdmin}><label>Full name<input name="fullName" required minLength={2} maxLength={120} /></label><label>Email<input name="email" type="email" required /></label><label>Temporary password<input name="password" type="password" required minLength={12} maxLength={128} placeholder="12+ characters, uppercase, number, symbol" /></label><p className="admin-access-hint">Share the temporary password securely. Admins can use the password reset flow to change it.</p></form>}<div className="admin-permission-groups">{permissionGroups.map((group) => <fieldset key={group.id}><legend>{group.label}</legend><p>{group.description}</p>{group.permissions.map((permission) => <label key={permission.code}><input type="checkbox" checked={group.id === "administrators" || newPermissions.includes(permission.code)} disabled={group.id === "administrators"} onChange={() => setPermission(permission.code)} /><span><strong>{permission.label}</strong><small>{group.id === "administrators" ? "Reserved for super admin" : permission.code}</small></span></label>)}</fieldset>)}</div><footer>{selectedAdmin && <button type="button" className="admin-outline-button" onClick={async () => { if (await action(() => adminRequest(`admins/${selectedAdmin.id}/status`, "PATCH", { disabled: !selectedAdmin.disabled }), selectedAdmin.disabled ? "Admin account enabled." : "Admin account disabled and signed out.")) setSelectedAdmin({ ...selectedAdmin, disabled: !selectedAdmin.disabled }); }}>{selectedAdmin.disabled ? "Enable account" : "Disable account"}</button>}<button type="button" className="admin-outline-button" onClick={() => { setNewAdminOpen(false); setSelectedAdmin(null); }}>Cancel</button><button type={selectedAdmin ? "button" : "submit"} form={selectedAdmin ? undefined : "create-admin-form"} className="admin-primary-button" disabled={busy} onClick={selectedAdmin ? () => void saveAdminPermissions() : undefined}>{selectedAdmin ? "Save access" : "Create administrator"}</button></footer></section></div>}
  </div>;
}
