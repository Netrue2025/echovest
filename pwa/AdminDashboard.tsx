"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, Check, ChevronDown, ClipboardList,
  Bell, Download, LayoutDashboard, LockKeyhole, LogOut, Megaphone, Search, ShieldCheck, Signal,
  UserRound, Users, Wallet, X, Landmark, TrendingUp, MessageCircle, Send, type LucideIcon,
} from "lucide-react";
import { adminRequest } from "../lib/admin-api";
import { financeRequest } from "../lib/finance-api";
import { notificationRequest, vapidKeyToBytes } from "../lib/notification-api";
import { referralRequest } from "../lib/referral-api";
import { SupportConversation, SupportMessage } from "../lib/support-api";
import { AdminTradeManager } from "./AdminTradeManager";

type AdminActor = { id: string; fullName: string; email: string; isSuperAdmin: boolean; permissions: string[] };
type ManagedUser = { id: string; fullName: string; email: string; role: string; isSuperAdmin: boolean; isEmailVerified: boolean; isDisabled: boolean; withdrawalsDisabled: boolean; tradingBalance?: number; referralBalance?: number; createdAt?: string };
type AdminOverview = { periodDays: number; registeredUsers: number; referralCount: number; walletBalance: number; tradingBalance: number; referralBalance: number; deposits: number; withdrawals: number; daily: { date: string; deposits: number; withdrawals: number }[] };
type UserBalances = { users: { id: string; fullName: string; email: string; tradingBalance: number; referralBalance: number; total: number }[]; totalTrading: number; totalReferral: number; totalBalance: number };
type ManagedAdmin = { id: string; fullName: string; email: string; permissions: string[]; disabled: boolean; createdAt?: string };
type AuditEvent = { id: string; actorId: string; actorEmail: string; action: string; targetType: string; targetId: string; targetLabel: string; detail: string; createdAt?: string };
type FinanceSettings = { depositWalletAddress: string; depositNetwork: string; depositInstructions: string; minimumDeposit: number; minimumWithdrawal: number; capitalLockDays: number; withdrawalDays: number[]; withdrawalWindowStart: string; withdrawalWindowEnd: string; withdrawalTimezone: string };
type FinanceTransaction = { id: string; type: "deposit" | "withdrawal"; amount: number; balanceType: string; status: string; txid: string; network: string; destinationAddress: string; sourceType?: string; maturedPrincipalWithdrawal?: boolean; rejectionReason: string; createdAt?: string; archivedAt?: string; user?: { fullName: string; email: string } | null };
type ProviderDepositHistory = { id: string; transactionHash: string; amount: string; asset: string; network: string; providerStatus: string; status: string; reason: string; createdAt?: string; archivedAt?: string; archiveReason?: string; user?: { fullName: string; email: string } | null };
type ReferralRate = { level: string; tier1: number; tier2: number; tier3: number };
type ReferralAdminUser = { id: string; fullName: string; membershipLevel: string };
type ReferralNetwork = { counts: { tier1: number; tier2: number; tier3: number }; downliners: { id: string; fullName: string; tier: number; earned: number; joinedAt?: string }[] };

const permissionGroups = [
  { id: "dashboard", label: "Dashboard", description: "View platform overview and summary", permissions: [{ code: "dashboard.view", label: "View overview" }] },
  { id: "users", label: "User accounts", description: "Search and manage registered users", permissions: [{ code: "users.view", label: "View users" }, { code: "users.manage", label: "Edit, disable, reset passwords, and delete users" }] },
  { id: "wallets", label: "Wallets and finance", description: "Manage wallet settings and transaction operations", permissions: [{ code: "wallets.view", label: "View wallets and finance settings" }, { code: "wallets.manage", label: "Edit deposit wallet details and transaction limits" }, { code: "wallets.adjust", label: "Adjust user wallet balances" }, { code: "deposits.manage", label: "Review and approve deposits" }, { code: "withdrawals.manage", label: "Review withdrawals and manage withdrawal access" }] },
  { id: "notifications", label: "Notifications", description: "Send important messages to registered users", permissions: [{ code: "notifications.manage", label: "Broadcast notifications to users" }] },
  { id: "support", label: "Customer support", description: "Read and reply to user and guest chats", permissions: [{ code: "support.manage", label: "Manage support conversations" }] },
  { id: "trading", label: "Copy trading", description: "Manage copy-trading signals and strategies", permissions: [{ code: "signals.manage", label: "Manage signals" }] },
  { id: "referrals", label: "Referrals and levels", description: "View referral networks and configure referral commissions", permissions: [{ code: "referrals.view", label: "View referrals and levels" }, { code: "referrals.manage", label: "Configure referral commission rates" }] },
  { id: "oversight", label: "Reports and audit", description: "View reports and administrative audit records", permissions: [{ code: "reports.view", label: "View reports" }, { code: "audit.view", label: "View audit log" }] },
  { id: "administrators", label: "Administrator access", description: "Super-admin only: create administrators and assign section access", permissions: [{ code: "admins.manage", label: "Manage admin accounts (super-admin only)" }] },
];
const withdrawalWeekdays = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]] as const;
const sections: { id: string; label: string; icon: LucideIcon; permission: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, permission: "dashboard.view" },
  { id: "balances", label: "User balances", icon: Landmark, permission: "wallets.view" },
  { id: "users", label: "Users", icon: Users, permission: "users.view" },
  { id: "deposits", label: "Deposits", icon: ArrowDownLeft, permission: "deposits.manage" },
  { id: "withdrawals", label: "Withdrawals", icon: ArrowUpRight, permission: "withdrawals.manage" },
  { id: "wallets", label: "Wallets", icon: Wallet, permission: "wallets.view" },
  { id: "notifications", label: "Notifications", icon: Bell, permission: "notifications.manage" },
  { id: "support", label: "Support chats", icon: MessageCircle, permission: "support.manage" },
  { id: "signals", label: "Copy signals", icon: Signal, permission: "signals.manage" },
  { id: "referrals", label: "Referrals & levels", icon: UserRound, permission: "referrals.view" },
  { id: "reports", label: "Reports", icon: BarChart3, permission: "reports.view" },
  { id: "audit", label: "Audit log", icon: ClipboardList, permission: "audit.view" },
  { id: "roles", label: "Admin access", icon: ShieldCheck, permission: "admins.manage" },
];
const sectionCopy: Record<string, string> = {
  overview: "Platform management and account activity.", users: "Review registered accounts and manage account access.", deposits: "Deposit operations and payment status.",
  withdrawals: "Withdrawal operations and user withdrawal access.", wallets: "Wallet settings and account wallet status.", signals: "Published copy-trading signals and strategies.",
  notifications: "Send an important message to registered user accounts.",
  support: "Reply to private support conversations from registered members and guests.",
  referrals: "Referral networks and membership levels.", reports: "Platform reports and activity summaries.", audit: "Review administrative actions and system events.", roles: "Create admin accounts and assign access to platform sections.",
};
const sectionPlaceholder: Record<string, string> = {
  deposits: "Deposit records will appear here when the deposit ledger is connected.",
  withdrawals: "Withdrawal requests will appear here when withdrawal processing is connected.",
  wallets: "Wallet provisioning and address controls will appear here when the wallet service is connected.",
  signals: "Published strategies and copier controls will appear here when signal management is connected.",
  referrals: "Configure referral commission rates by level and downline tier.",
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

function FinanceTable({ title, items, busy, archivedView, onReview, onArchive, onRestore, onArchiveAll, onToggleArchived }: { title: string; items: FinanceTransaction[]; busy: boolean; archivedView: boolean; onReview: (item: FinanceTransaction, decision: "approved" | "rejected") => void; onArchive: (item: FinanceTransaction) => void; onRestore: (item: FinanceTransaction) => void; onArchiveAll: () => void; onToggleArchived: () => void }) {
  const eligible = items.filter((item) => item.status === "approved" || item.status === "rejected");
  return <article className="admin-panel admin-records"><div className="admin-panel-head"><div><h2>{title}</h2><p>Approved/rejected records can be hidden from history. Financial records remain preserved for audit and reconciliation.</p></div><div className="admin-record-actions"><span>{items.filter((item) => item.status === "network_confirmation" || item.status === "pending_review").length} awaiting review</span><button type="button" className="admin-outline-button" disabled={busy} onClick={onToggleArchived}>{archivedView ? "Back to active history" : "View archived"}</button>{!archivedView && eligible.length > 0 && <button type="button" className="admin-inline-action" disabled={busy} onClick={onArchiveAll}>Clear reviewed history</button>}</div></div><div className="admin-table-wrap"><table><thead><tr><th>User</th><th>Amount</th><th>Network / balance</th><th>Address / TXID</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.user?.fullName ?? "Deleted user"}<small>{item.user?.email ?? ""}</small></td><td>{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })} USDT</td><td>{item.type === "withdrawal" ? (item.sourceType === "trade_interest" ? "Trade profit" : item.maturedPrincipalWithdrawal ? "Matured principal" : item.balanceType) : item.network}</td><td>{item.type === "deposit" ? item.txid || "No TXID provided" : item.sourceType === "trade_interest" ? "Accrued copy-trade profit" : item.destinationAddress}<small>{item.type === "withdrawal" ? item.network : "Transaction hash"}</small></td><td><i className={item.status === "approved" ? "status-active" : item.status === "rejected" ? "status-review" : "status-pending"}>{item.status.replaceAll("_", " ")}</i>{item.rejectionReason && <small>{item.rejectionReason}</small>}</td><td>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</td><td>{(item.status === "network_confirmation" || item.status === "pending_review") ? <><button className="admin-row-manage" type="button" disabled={busy} onClick={() => onReview(item, "approved")}>Approve</button><button className="admin-inline-action" type="button" disabled={busy} onClick={() => onReview(item, "rejected")}>Reject</button></> : archivedView ? <button className="admin-row-manage" type="button" disabled={busy} onClick={() => onRestore(item)}>Restore</button> : eligible.includes(item) ? <button className="admin-inline-action" type="button" disabled={busy} onClick={() => onArchive(item)}>Hide history</button> : "Active request"}</td></tr>)}</tbody></table>{!items.length && <div className="admin-empty">{archivedView ? "No archived history." : "No requests have been submitted yet."}</div>}</div></article>;
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
  const [financeSettings, setFinanceSettings] = useState<FinanceSettings>({ depositWalletAddress: "", depositNetwork: "", depositInstructions: "", minimumDeposit: 0, minimumWithdrawal: 0, capitalLockDays: 60, withdrawalDays: [1, 3, 5], withdrawalWindowStart: "09:00", withdrawalWindowEnd: "17:00", withdrawalTimezone: "Africa/Lagos" });
  const [withdrawalDays, setWithdrawalDays] = useState<number[]>([1, 3, 5]);
  const [deposits, setDeposits] = useState<FinanceTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<FinanceTransaction[]>([]);
  const [providerDeposits, setProviderDeposits] = useState<ProviderDepositHistory[]>([]);
  const [depositArchivedView, setDepositArchivedView] = useState(false);
  const [withdrawalArchivedView, setWithdrawalArchivedView] = useState(false);
  const [referralRates, setReferralRates] = useState<ReferralRate[]>(["Blue", "Elite", "Silver", "Gold", "Platinum"].map((level) => ({ level, tier1: 0, tier2: 0, tier3: 0 })));
  const [referralUsers, setReferralUsers] = useState<ReferralAdminUser[]>([]);
  const [referralUserId, setReferralUserId] = useState("");
  const [referralNetwork, setReferralNetwork] = useState<ReferralNetwork | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [periodDays, setPeriodDays] = useState(30);
  const [balances, setBalances] = useState<UserBalances | null>(null);
  const [balanceQuery, setBalanceQuery] = useState("");
  const [balanceTarget, setBalanceTarget] = useState<UserBalances["users"][number] | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [supportChats, setSupportChats] = useState<{ id: string; email: string; participantType: "registered" | "guest"; status: "open" | "closed"; lastMessage: string; lastMessageAt: string; unread: boolean }[]>([]);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [supportThread, setSupportThread] = useState<SupportConversation | null>(null);
  const [adminPushEnabled, setAdminPushEnabled] = useState(false);

  const can = useCallback((permission: string) => Boolean(actor?.isSuperAdmin || actor?.permissions.includes(permission) || (permission === "users.view" && actor?.permissions.includes("users.manage")) || (permission === "wallets.view" && actor?.permissions.some((item) => item === "wallets.manage" || item === "wallets.adjust"))), [actor]);
  const loadUsers = useCallback(async () => {
    if (!actor?.isSuperAdmin && !actor?.permissions.some((permission) => permission === "users.view" || permission === "users.manage")) return;
    setUsers(await adminRequest<ManagedUser[]>("users"));
  }, [actor]);
  const loadOverview = useCallback(async () => { if (can("dashboard.view")) setOverview(await adminRequest<AdminOverview>(`overview?days=${periodDays}`)); }, [can, periodDays]);
  const loadBalances = useCallback(async () => { if (can("wallets.view")) setBalances(await adminRequest<UserBalances>("user-balances")); }, [can]);
  const loadAdmins = useCallback(async () => {
    if (!actor?.isSuperAdmin) return;
    setAdmins(await adminRequest<ManagedAdmin[]>("admins"));
  }, [actor]);
  const loadAudit = useCallback(async () => {
    if (!actor?.isSuperAdmin && !actor?.permissions.includes("audit.view")) return;
    setAuditEvents(await adminRequest<AuditEvent[]>("audit"));
  }, [actor]);
  const loadFinanceSettings = useCallback(async () => { if (can("wallets.view") || can("wallets.manage")) { const settings = await financeRequest<FinanceSettings>("admin/settings"); setFinanceSettings(settings); setWithdrawalDays(settings.withdrawalDays); } }, [can]);
  const loadDeposits = useCallback(async () => { if (can("deposits.manage")) setDeposits(await financeRequest<FinanceTransaction[]>(`admin/deposits${depositArchivedView ? "?archived=true" : ""}`)); }, [can, depositArchivedView]);
  const loadProviderDeposits = useCallback(async () => { if (can("deposits.manage")) setProviderDeposits(await adminRequest<ProviderDepositHistory[]>(`deposit-events/history${depositArchivedView ? "?archived=true" : ""}`)); }, [can, depositArchivedView]);
  const loadWithdrawals = useCallback(async () => { if (can("withdrawals.manage")) setWithdrawals(await financeRequest<FinanceTransaction[]>(`admin/withdrawals${withdrawalArchivedView ? "?archived=true" : ""}`)); }, [can, withdrawalArchivedView]);
  const loadSupportChats = useCallback(async () => { if (can("support.manage")) setSupportChats(await adminRequest<typeof supportChats>("support/conversations")); }, [can]);
  const loadSupportThread = useCallback(async (id: string) => { if (id && can("support.manage")) setSupportThread(await adminRequest<SupportConversation>(`support/conversations/${encodeURIComponent(id)}`)); }, [can]);
  const loadReferralRates = useCallback(async () => { if (can("referrals.view")) { const [result, networkUsers] = await Promise.all([referralRequest<{ rates: ReferralRate[] }>("admin/settings"), referralRequest<ReferralAdminUser[]>("admin/users")]); setReferralRates(result.rates); setReferralUsers(networkUsers); setReferralUserId((current) => current || networkUsers[0]?.id || ""); } }, [can]);
  useEffect(() => { if (!referralUserId || !can("referrals.view")) return; referralRequest<ReferralNetwork>(`admin/network/${encodeURIComponent(referralUserId)}`).then(setReferralNetwork).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load this referral network.")); }, [referralUserId, can]);

  useEffect(() => {
    let active = true;
    adminRequest<{ user: AdminActor }>("auth/me").then((result) => { if (active) setActor(result.user); }).catch(() => undefined).finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!actor) return;
    let active = true;
    Promise.all([loadUsers(), loadOverview(), loadBalances(), loadAdmins(), loadAudit(), loadFinanceSettings(), loadDeposits(), loadProviderDeposits(), loadWithdrawals(), loadReferralRates(), loadSupportChats()]).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load admin data."); });
    return () => { active = false; };
  }, [actor, loadUsers, loadOverview, loadBalances, loadAdmins, loadAudit, loadFinanceSettings, loadDeposits, loadProviderDeposits, loadWithdrawals, loadReferralRates, loadSupportChats]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("section") === "support" && can("support.manage")) setSection("support");
  }, [can]);

  useEffect(() => {
    if (section !== "support" || !can("support.manage")) return;
    void loadSupportChats();
    const timer = window.setInterval(() => void loadSupportChats(), 10000);
    return () => window.clearInterval(timer);
  }, [section, can, loadSupportChats]);

  useEffect(() => {
    if (!selectedChatId || section !== "support" || !can("support.manage")) return;
    void loadSupportThread(selectedChatId);
    const timer = window.setInterval(() => void loadSupportThread(selectedChatId), 7000);
    return () => window.clearInterval(timer);
  }, [selectedChatId, section, can, loadSupportThread]);

  useEffect(() => {
    if (!actor || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => setAdminPushEnabled(Boolean(subscription))).catch(() => undefined);
  }, [actor]);

  const visibleSections = useMemo(() => sections.filter((item) => item.id === "wallets" ? can("wallets.view") || can("wallets.manage") : item.id !== "roles" ? can(item.permission) : Boolean(actor?.isSuperAdmin)), [can, actor]);
  const current = visibleSections.find((item) => item.id === section) ?? visibleSections[0];
  const mobilePrimarySections = visibleSections.filter((item) => ["overview", "users", "balances", "deposits", "withdrawals"].includes(item.id));
  const mobileMoreSections = visibleSections.filter((item) => !["overview", "users", "balances", "deposits", "withdrawals"].includes(item.id));
  useEffect(() => { if (current && current.id !== section) setSection(current.id); }, [current, section]);
  const matches = (name: string, email: string, status: string) => `${name} ${email} ${status}`.toLowerCase().includes(query.toLowerCase());
  const filteredUsers = users.filter((user) => matches(user.fullName, user.email, `${user.role} ${user.isDisabled ? "disabled" : "active"}`));
  const filteredAdmins = admins.filter((admin) => matches(admin.fullName, admin.email, admin.disabled ? "disabled" : "active"));

  async function reload() {
    try { await Promise.all([loadUsers(), loadOverview(), loadBalances(), loadAdmins(), loadAudit(), loadFinanceSettings(), loadDeposits(), loadProviderDeposits(), loadWithdrawals(), loadReferralRates(), loadSupportChats()]); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh data."); }
  }
  async function sendSupportReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedChatId) return;
    const body = String(new FormData(event.currentTarget).get("body") ?? "").trim(); if (!body) return;
    const form = event.currentTarget; setBusy(true); setError(""); setNotice("");
    try {
      await adminRequest(`support/conversations/${encodeURIComponent(selectedChatId)}/messages`, "POST", { body });
      form.reset(); setNotice("Reply sent. The participant has been notified.");
      await Promise.all([loadSupportThread(selectedChatId), loadSupportChats()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send this support reply."); }
    finally { setBusy(false); }
  }
  async function enableAdminPush() {
    setBusy(true); setError(""); setNotice("");
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Push notifications are not supported by this browser.");
      if (await Notification.requestPermission() !== "granted") throw new Error("Allow notifications in browser settings to receive support alerts.");
      const { publicKey } = await notificationRequest<{ publicKey: string }>("push/public-key");
      if (!publicKey) throw new Error("Push notifications are not configured on the server yet.");
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToBytes(publicKey) });
      const json = subscription.toJSON();
      if (!subscription.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Could not read the browser push subscription.");
      await notificationRequest("push/subscription", "POST", { endpoint: subscription.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, expirationTime: subscription.expirationTime });
      setAdminPushEnabled(true); setNotice("Support alerts are enabled on this device.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not enable support alerts."); }
    finally { setBusy(false); }
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
    const payload = { depositWalletAddress: String(data.get("depositWalletAddress") ?? ""), depositNetwork: String(data.get("depositNetwork") ?? ""), depositInstructions: String(data.get("depositInstructions") ?? ""), minimumDeposit: Number(data.get("minimumDeposit") ?? 0), minimumWithdrawal: Number(data.get("minimumWithdrawal") ?? 0), capitalLockDays: Number(data.get("capitalLockDays") ?? 60), withdrawalDays, withdrawalWindowStart: String(data.get("withdrawalWindowStart") ?? "09:00"), withdrawalWindowEnd: String(data.get("withdrawalWindowEnd") ?? "17:00"), withdrawalTimezone: String(data.get("withdrawalTimezone") ?? "Africa/Lagos") };
    if (await action(() => financeRequest("admin/settings", "PATCH", payload), "Finance settings and account-wide withdrawal policy saved.")) setFinanceSettings(payload);
  }
  async function saveReferralSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await action(() => referralRequest("admin/settings", "PATCH", { rates: referralRates.map(({ level, tier1, tier2, tier3 }) => ({ level, tier1, tier2, tier3 })) }), "Referral commission rates saved.")) setNotice("Referral commission rates saved. They apply to future approved deposit commissions.");
  }
  async function adjustReferralBonus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!referralUserId) { setError("Select a user account first."); return; }
    const data = new FormData(event.currentTarget);
    const direction = String(data.get("direction"));
    const amount = Number(data.get("amount"));
    const reason = String(data.get("reason") ?? "");
    if (await action(() => referralRequest("admin/bonus", "POST", { userId: referralUserId, amount, direction, reason }), `Referral balance ${direction === "credit" ? "credited" : "adjusted"} with an audit record.`)) event.currentTarget.reset();
  }
  async function reviewFinance(item: FinanceTransaction, decision: "approved" | "rejected") {
    const rejectionReason = decision === "rejected" ? window.prompt("Enter the reason for rejection:")?.trim() : undefined;
    if (decision === "rejected" && !rejectionReason) return;
    const path = item.type === "deposit" ? "deposits" : "withdrawals";
    await action(() => financeRequest(`admin/${path}/${item.id}`, "PATCH", { decision, rejectionReason }), decision === "approved" ? "Request approved and balance updated." : "Request rejected.");
  }
  async function archiveFinanceHistory(item: FinanceTransaction) {
    const reason = window.prompt("Reason for hiding this transaction from history:")?.trim();
    if (!reason || reason.length < 3) return;
    const path = item.type === "deposit" ? "deposits" : "withdrawals";
    await action(() => financeRequest(`admin/${path}/${item.id}/archive`, "POST", { reason }), "Transaction hidden from normal history. Financial records remain preserved.");
  }
  async function restoreFinanceHistory(item: FinanceTransaction) {
    const path = item.type === "deposit" ? "deposits" : "withdrawals";
    await action(() => financeRequest(`admin/${path}/${item.id}/restore`, "POST", {}), "Transaction history restored.");
  }
  async function archiveAllFinanceHistory(type: "deposit" | "withdrawal") {
    const prompt = window.prompt("Reason for clearing reviewed history:")?.trim();
    if (!prompt || prompt.length < 3) return;
    const label = type === "deposit" ? "deposit" : "withdrawal";
    if (!window.confirm(`Hide all approved and rejected ${label} history from normal views? Pending requests will stay visible. Records and audit data will be retained.`)) return;
    const path = type === "deposit" ? "deposits" : "withdrawals";
    await action(() => financeRequest(`admin/${path}/archive-history`, "POST", { reason: prompt }), `Reviewed ${label} history cleared from normal views.`);
  }
  async function archiveProviderDeposit(item: ProviderDepositHistory) {
    const reason = window.prompt("Reason for hiding this deposit from history:")?.trim();
    if (!reason || reason.length < 3) return;
    await action(() => adminRequest(`deposit-events/history/${item.id}/archive`, "POST", { reason }), "Deposit hidden from normal history. Deposit ledger and audit records remain preserved.");
  }
  async function restoreProviderDeposit(item: ProviderDepositHistory) {
    await action(() => adminRequest(`deposit-events/history/${item.id}/restore`, "POST", {}), "Deposit history restored.");
  }
  async function archiveAllProviderDeposits() {
    const reason = window.prompt("Reason for clearing resolved deposit history:")?.trim();
    if (!reason || reason.length < 3) return;
    if (!window.confirm("Hide all credited and rejected ChainPay deposits from normal views? Pending, disputed, and review-required deposits stay visible. Financial records will be retained.")) return;
    await action(() => adminRequest("deposit-events/history/archive-all", "POST", { reason }), "Resolved deposit history cleared from normal views.");
  }

  async function broadcastNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = await action(() => notificationRequest<{ sent: number }>("admin/broadcast", "POST", { title: data.get("title"), message: data.get("message") }), "Notification broadcast delivered to the user inboxes.");
    if (result) form.reset();
  }
  async function adjustBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!balanceTarget) return;
    const data = new FormData(event.currentTarget);
    const ok = await action(() => adminRequest(`users/${balanceTarget.id}/balance`, "PATCH", { wallet: data.get("wallet"), direction: data.get("direction"), amount: Number(data.get("amount")), reason: data.get("reason") }), "Wallet balance adjusted and recorded in the admin audit log.");
    if (ok) setBalanceTarget(null);
  }
  const setPermission = (code: string) => setNewPermissions((currentPermissions) => currentPermissions.includes(code) ? currentPermissions.filter((item) => item !== code) : [...currentPermissions, code]);

  return <div className="admin-app">
    <aside className="admin-sidebar"><a className="admin-brand" href="/admin"><span><BarChart3 size={20} /></span>EchoVest <small>ADMIN</small></a><nav className="admin-nav" aria-label="Admin navigation">{visibleSections.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={section === id ? "active" : ""} onClick={() => { setSection(id); setQuery(""); }}><Icon size={18} /><span>{label}</span></button>)}</nav><div className="admin-sidebar-foot"><ShieldCheck size={17} /><span>{actor.isSuperAdmin ? "Super admin · all permissions enabled" : `${actor.permissions.length} access permissions enabled`}</span></div></aside>
    <main className="admin-main">
      <header className="admin-topbar"><div><span>ADMIN CONSOLE</span><b>{current.label}</b></div><div><span className="admin-avatar">{actor.fullName.slice(0, 1).toUpperCase()}</span><span className="admin-user-label">{actor.isSuperAdmin ? "Super admin" : actor.fullName}</span><button type="button" className="admin-signout-button" onClick={signOut} aria-label="Sign out"><LogOut size={16} /></button></div></header>
      <section className="admin-content">
        <div className="admin-heading"><div><p>PLATFORM MANAGEMENT</p><h1>{current.id === "overview" ? `Welcome, ${actor.fullName.split(" ")[0]}` : current.label}</h1><span>{sectionCopy[current.id]}</span></div><a href="/dashboard"><ArrowRight size={15} /> User app</a></div>
        {(notice || error) && <p className={`admin-action-notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{error || notice}<button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss message"><X size={15} /></button></p>}
        {current.id === "overview" && <>
          <div className="admin-period-control"><span>Reporting period</span><select value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 12 months</option></select><button type="button" onClick={() => void loadOverview()} disabled={busy}><Download size={14}/> Refresh</button></div>
          <div className="admin-live-overview admin-finance-overview">
            <article><span><Users size={18}/></span><small>Registered users</small><strong>{overview?.registeredUsers ?? "—"}</strong><p>All customer accounts</p></article>
            <article><span><UserRound size={18}/></span><small>Total referrals</small><strong>{overview?.referralCount ?? "—"}</strong><p>Users joined through a referral</p></article>
            <button type="button" className="admin-overview-balance" onClick={() => setSection("balances")}><article><span><Wallet size={18}/></span><small>Total investment balance</small><strong>${(overview?.tradingBalance ?? 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><p>All user investment wallets · View users <ArrowRight size={12}/></p></article></button>
            <button type="button" className="admin-overview-balance admin-referral-balance-card" onClick={() => setSection("balances")}><article><span><Users size={18}/></span><small>Total referral balance</small><strong>${(overview?.referralBalance ?? 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><p>All user referral wallets · View users <ArrowRight size={12}/></p></article></button>
            <article><span><ArrowDownLeft size={18}/></span><small>Deposits · {periodDays} days</small><strong>${(overview?.deposits ?? 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><p>Approved / verified deposits</p></article>
            <article><span><ArrowUpRight size={18}/></span><small>Withdrawals · {periodDays} days</small><strong>${(overview?.withdrawals ?? 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><p>Approved withdrawals</p></article>
          </div>
          <article className="admin-panel admin-chart-panel"><div className="admin-panel-head"><div><h2>Deposit and withdrawal activity</h2><p>Completed transactions, grouped by day · USD</p></div><TrendingUp size={18}/></div><div className="admin-chart-legend"><span><i/>Deposits</span><span><i/>Withdrawals</span></div><div className="admin-activity-chart" role="img" aria-label={`Daily deposits and withdrawals for the last ${periodDays} days`}>{(overview?.daily ?? []).map((day) => { const max = Math.max(1, ...(overview?.daily ?? []).flatMap((item) => [item.deposits,item.withdrawals])); return <div key={day.date} title={`${day.date}: deposits $${day.deposits.toFixed(2)}, withdrawals $${day.withdrawals.toFixed(2)}`}><span style={{height:`${Math.max(2,day.deposits/max*100)}%`}}/><span style={{height:`${Math.max(2,day.withdrawals/max*100)}%`}}/></div>; })}</div><div className="admin-chart-axis"><span>{overview?.daily[0]?.date ?? ""}</span><span>{overview?.daily[Math.floor((overview?.daily.length ?? 1)/2)]?.date ?? ""}</span><span>{overview?.daily.at(-1)?.date ?? ""}</span></div></article>
        </>}
        {current.id === "balances" && <article className="admin-panel admin-records"><div className="admin-panel-head"><div><h2>User wallet balances</h2><p>Combined customer balance: <strong>${(balances?.totalBalance ?? 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} USD</strong></p></div><div className="admin-record-actions"><label><Search size={15}/><input value={balanceQuery} onChange={(event)=>setBalanceQuery(event.target.value)} placeholder="Search users"/></label><button type="button" onClick={()=>void loadBalances()}><Download size={14}/> Refresh</button></div></div><div className="admin-balance-summary"><span>Investment balance <strong>${(balances?.totalTrading??0).toFixed(2)}</strong></span><span>Referral balance <strong>${(balances?.totalReferral??0).toFixed(2)}</strong></span><span>Combined <strong>${(balances?.totalBalance??0).toFixed(2)}</strong></span></div><div className="admin-table-wrap"><table><thead><tr><th>User</th><th>Investment wallet</th><th>Referral wallet</th><th>Total</th><th>Action</th></tr></thead><tbody>{(balances?.users??[]).filter((u)=>`${u.fullName} ${u.email}`.toLowerCase().includes(balanceQuery.toLowerCase())).map((u)=><tr key={u.id}><td><strong>{u.fullName}</strong><small>{u.email}</small></td><td>${u.tradingBalance.toFixed(2)}</td><td>${u.referralBalance.toFixed(2)}</td><td><strong>${u.total.toFixed(2)}</strong></td><td>{can("wallets.adjust")&&<button className="admin-row-manage" type="button" onClick={()=>setBalanceTarget(u)}>Adjust balance</button>}</td></tr>)}</tbody><tfoot><tr><th>Total ({(balances?.users??[]).length} users)</th><th>${(balances?.totalTrading??0).toFixed(2)}</th><th>${(balances?.totalReferral??0).toFixed(2)}</th><th>${(balances?.totalBalance??0).toFixed(2)}</th><th/></tr></tfoot></table></div></article>}
        {current.id === "users" && <article className="admin-panel admin-records"><div className="admin-panel-head"><div><h2>Registered users</h2><p>{users.length} accounts · user and admin accounts are protected from unauthorized actions</p></div><div className="admin-record-actions"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" /></label><button type="button" onClick={reload} disabled={busy}><Download size={14} /> Refresh</button></div></div><div className="admin-table-wrap"><table><thead><tr><th>Account</th><th>Role</th><th>Email</th><th>Status</th><th>Withdrawals</th><th>Joined</th><th>Manage</th></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id}><td><span className="admin-table-avatar">{user.fullName.slice(0, 1).toUpperCase()}</span><strong>{user.fullName}</strong></td><td>{user.isSuperAdmin ? "Super admin" : user.role}</td><td>{user.email}<small>{user.isEmailVerified ? "Email verified" : "Email unverified"}</small></td><td><i className={user.isDisabled ? "status-review" : "status-active"}>{user.isDisabled ? "Disabled" : "Active"}</i></td><td><i className={user.withdrawalsDisabled ? "status-review" : "status-active"}>{user.withdrawalsDisabled ? "Disabled" : "Enabled"}</i></td><td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</td><td>{(can("users.manage") || can("withdrawals.manage")) && !user.isSuperAdmin && user.role !== "admin" ? <button className="admin-row-manage" type="button" onClick={() => setSelectedUser(user)}>Manage</button> : <span className="admin-protected-label">Protected</span>}</td></tr>)}</tbody></table>{!filteredUsers.length && <div className="admin-empty">No registered users match your search.</div>}</div></article>}
        {current.id === "roles" && actor.isSuperAdmin && <>
          <article className="admin-panel admin-role-create"><div><h2>Administrator accounts</h2><p>Create team admin accounts and assign access to grouped app functions.</p></div><button className="admin-primary-button compact" type="button" onClick={() => { setNewAdminOpen(true); setNewPermissions([]); }}><Users size={15} /> Add administrator</button></article>
        <article className="admin-panel admin-records"><div className="admin-panel-head"><div><h2>Current administrators</h2><p>Super admin access is controlled through environment credentials.</p></div><div className="admin-record-actions"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search administrators" /></label><button type="button" onClick={reload} disabled={busy}>Refresh</button></div></div><div className="admin-table-wrap"><table><thead><tr><th>Administrator</th><th>Email</th><th>Access groups</th><th>Status</th><th>Created</th><th /></tr></thead><tbody>{filteredAdmins.map((admin) => <tr key={admin.id}><td><span className="admin-table-avatar">{admin.fullName.slice(0, 1).toUpperCase()}</span><strong>{admin.fullName}</strong></td><td>{admin.email}</td><td>{admin.permissions.length} permissions</td><td><i className={admin.disabled ? "status-review" : "status-active"}>{admin.disabled ? "Disabled" : "Active"}</i></td><td>{admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : "—"}</td><td><button className="admin-row-manage" type="button" onClick={() => { setSelectedAdmin(admin); setNewPermissions(admin.permissions); }}>Manage access</button><button className="admin-inline-action" type="button" disabled={busy} onClick={async () => { if (await action(() => adminRequest(`admins/${admin.id}/status`, "PATCH", { disabled: !admin.disabled }), admin.disabled ? "Admin account enabled." : "Admin account disabled and signed out.")) { if (selectedAdmin?.id === admin.id) setSelectedAdmin({ ...admin, disabled: !admin.disabled }); } }}>{admin.disabled ? "Enable" : "Disable"}</button></td></tr>)}</tbody></table>{!filteredAdmins.length && <div className="admin-empty">No admin accounts found.</div>}</div></article>
        </>}
        {current.id === "audit" && <article className="admin-panel admin-records"><div className="admin-panel-head"><div><h2>Admin action history</h2><p>Recent user-account and admin-access changes · latest 250 events</p></div><button type="button" onClick={reload} disabled={busy}><Download size={14} /> Refresh</button></div><div className="admin-table-wrap"><table><thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>{auditEvents.map((event) => <tr key={event.id}><td>{event.createdAt ? new Date(event.createdAt).toLocaleString() : "—"}</td><td>{event.actorEmail}</td><td>{event.action.replaceAll(".", " ")}</td><td>{event.targetLabel}<small>{event.targetType}</small></td><td>{event.detail}</td></tr>)}</tbody></table>{!auditEvents.length && <div className="admin-empty">No admin actions have been recorded yet.</div>}</div></article>}
        {current.id === "wallets" && <>
          <form key={JSON.stringify(financeSettings)} className="admin-panel admin-finance-settings" onSubmit={saveFinanceSettings}><div className="admin-panel-head"><div><h2>Deposit wallet and limits</h2><p>Updated limits apply immediately to new user requests.</p></div></div><div className="admin-finance-fields"><label>Deposit wallet address<input name="depositWalletAddress" defaultValue={financeSettings.depositWalletAddress} required disabled={!can("wallets.manage")} /></label><label>Network<input name="depositNetwork" defaultValue={financeSettings.depositNetwork} placeholder="e.g. TRC20" required disabled={!can("wallets.manage")} /></label><label>Minimum deposit (USDT)<input name="minimumDeposit" type="number" min="0" step="any" defaultValue={financeSettings.minimumDeposit} required disabled={!can("wallets.manage")} /></label><label>Minimum withdrawal (USDT)<input name="minimumWithdrawal" type="number" min="0" step="any" defaultValue={financeSettings.minimumWithdrawal} required disabled={!can("wallets.manage")} /></label><label className="wide">Important deposit information<textarea name="depositInstructions" rows={4} defaultValue={financeSettings.depositInstructions} placeholder="Payment instructions and network warnings" disabled={!can("wallets.manage")} /></label></div><section className="admin-account-withdraw-policy"><div><h3>Account withdrawal dates and capital lockup</h3><p>These rules apply across investment principal, referral funds, and trade profit. Locked main-balance capital remains available to join trades.</p></div><div className="admin-finance-fields"><label>Capital lock period (days)<input name="capitalLockDays" type="number" min="1" max="3650" step="1" defaultValue={financeSettings.capitalLockDays} required disabled={!can("wallets.manage")} /></label><label>Withdrawal timezone<input name="withdrawalTimezone" defaultValue={financeSettings.withdrawalTimezone} placeholder="Africa/Lagos" required disabled={!can("wallets.manage")} /></label></div><div className="admin-account-withdraw-days"><strong>Withdrawal days</strong><div className="admin-trade-days">{withdrawalWeekdays.map(([value, label]) => <label key={value}><input type="checkbox" checked={withdrawalDays.includes(value)} disabled={!can("wallets.manage")} onChange={() => setWithdrawalDays((current) => current.includes(value) ? current.filter((day) => day !== value) : [...current, value])}/><span>{label}</span></label>)}</div></div><div className="admin-trade-time-fields"><label>Window opens<input name="withdrawalWindowStart" type="time" defaultValue={financeSettings.withdrawalWindowStart} required disabled={!can("wallets.manage")} /></label><label>Window closes<input name="withdrawalWindowEnd" type="time" defaultValue={financeSettings.withdrawalWindowEnd} required disabled={!can("wallets.manage")} /></label></div></section>{can("wallets.manage") && <button className="admin-primary-button" disabled={busy || withdrawalDays.length === 0}>Save finance settings</button>}</form>
        </>}
        {current.id === "deposits" && <>
          <article className="admin-panel admin-records"><div className="admin-panel-head"><div><h2>ChainPay deposit history</h2><p>Hide resolved deposits from normal history without deleting provider or ledger records.</p></div><div className="admin-record-actions"><button type="button" className="admin-outline-button" disabled={busy} onClick={() => setDepositArchivedView((value) => !value)}>{depositArchivedView ? "Back to active history" : "View archived"}</button>{!depositArchivedView && providerDeposits.some((item) => item.status === "credited" || item.status === "rejected") && <button type="button" className="admin-inline-action" disabled={busy} onClick={() => void archiveAllProviderDeposits()}>Clear resolved history</button>}</div></div><div className="admin-table-wrap"><table><thead><tr><th>User</th><th>Amount</th><th>Network</th><th>Transaction hash</th><th>Status</th><th>Received</th><th>Action</th></tr></thead><tbody>{providerDeposits.map((item) => <tr key={item.id}><td>{item.user?.fullName ?? "Deleted user"}<small>{item.user?.email ?? ""}</small></td><td>{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {item.asset}</td><td>{item.network}</td><td>{item.transactionHash}<small>{item.providerStatus}</small></td><td><i className={item.status === "credited" ? "status-active" : item.status === "rejected" ? "status-review" : "status-pending"}>{item.status.replaceAll("_", " ")}</i>{item.archiveReason && <small>{item.archiveReason}</small>}</td><td>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</td><td>{depositArchivedView ? <button type="button" className="admin-row-manage" disabled={busy} onClick={() => void restoreProviderDeposit(item)}>Restore</button> : (item.status === "credited" || item.status === "rejected") ? <button type="button" className="admin-inline-action" disabled={busy} onClick={() => void archiveProviderDeposit(item)}>Hide history</button> : "Active record"}</td></tr>)}</tbody></table>{!providerDeposits.length && <div className="admin-empty">{depositArchivedView ? "No archived ChainPay deposits." : "No ChainPay deposits have been recorded."}</div>}</div></article>
          <FinanceTable title="Legacy deposit requests" items={deposits} onReview={reviewFinance} onArchive={archiveFinanceHistory} onRestore={restoreFinanceHistory} onArchiveAll={() => void archiveAllFinanceHistory("deposit")} onToggleArchived={() => setDepositArchivedView((value) => !value)} archivedView={depositArchivedView} busy={busy} />
        </>}
        {current.id === "withdrawals" && <FinanceTable title="Withdrawal history and requests" items={withdrawals} onReview={reviewFinance} onArchive={archiveFinanceHistory} onRestore={restoreFinanceHistory} onArchiveAll={() => void archiveAllFinanceHistory("withdrawal")} onToggleArchived={() => setWithdrawalArchivedView((value) => !value)} archivedView={withdrawalArchivedView} busy={busy} />}
        {current.id === "notifications" && <form className="admin-panel admin-broadcast-form" onSubmit={broadcastNotification}><div className="admin-panel-head"><div><h2>Broadcast an important update</h2><p>Send an in-app message to every registered user. Users with push enabled will also receive a device alert.</p></div><span className="admin-broadcast-icon"><Megaphone size={18} /></span></div><label>Notification title<input name="title" minLength={3} maxLength={120} placeholder="e.g. Scheduled maintenance" required /></label><label>Message<textarea name="message" minLength={3} maxLength={2000} rows={6} placeholder="Write the update users should see in their notification inbox." required /></label><div className="admin-broadcast-foot"><small>Up to 2,000 characters. This message will appear in each user’s inbox.</small><button className="admin-primary-button" disabled={busy}><Megaphone size={15} /> Send notification</button></div></form>}
        {current.id === "referrals" && <form className="admin-panel admin-finance-settings" onSubmit={saveReferralSettings}><div className="admin-panel-head"><div><h2>Referral commission rates</h2><p>Set the percentage of an approved deposit paid to each upline tier, based on the recipient’s membership level.</p></div></div><p className="admin-access-hint">All rates start at 0%. The PRD leaves exact values to be confirmed. Tier 2 and Tier 3 rates must not exceed the preceding tier. These rates apply only to future approved deposits.</p><div className="admin-table-wrap"><table><thead><tr><th>Member level</th><th>Tier 1 (%)</th><th>Tier 2 (%)</th><th>Tier 3 (%)</th></tr></thead><tbody>{referralRates.map((row) => <tr key={row.level}><td><strong>{row.level}</strong></td>{(["tier1", "tier2", "tier3"] as const).map((tier) => <td key={tier}><input className="admin-referral-rate-input" aria-label={`${row.level} ${tier} commission percent`} type="number" min="0" max="100" step="0.01" value={row[tier]} disabled={!can("referrals.manage")} onChange={(event) => setReferralRates((items) => items.map((item) => item.level === row.level ? { ...item, [tier]: Number(event.target.value) } : item))} /></td>)}</tr>)}</tbody></table></div>{can("referrals.manage") && <button className="admin-primary-button" disabled={busy}>Save referral rates</button>}</form>}
        {current.id === "referrals" && <article className="admin-panel admin-records"><div className="admin-panel-head"><div><h2>Referral network lookup</h2><p>Review up to three tiers. Downliner wallet balances are never shown.</p></div><label>Account<select value={referralUserId} onChange={(event) => setReferralUserId(event.target.value)}><option value="">Select a user</option>{referralUsers.map((user) => <option key={user.id} value={user.id}>{user.fullName} · {user.membershipLevel}</option>)}</select></label></div><div className="admin-table-wrap"><table><thead><tr><th>Downliner</th><th>Tier</th><th>Commission earned</th><th>Joined</th></tr></thead><tbody>{referralNetwork?.downliners.map((member) => <tr key={member.id}><td>{member.fullName}</td><td>{member.tier}</td><td>{Number(member.earned).toFixed(2)} USD</td><td>{member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : "—"}</td></tr>)}</tbody></table>{referralNetwork && !referralNetwork.downliners.length && <div className="admin-empty">No downliners are recorded for this account.</div>}</div></article>}
        {current.id === "signals" && <AdminTradeManager />}
        {current.id === "support" && <>
          <article className="admin-panel admin-support-alerts"><div><span className="admin-support-alert-icon"><Bell size={17}/></span><span><strong>Support message alerts</strong><small>{adminPushEnabled ? "Push alerts are enabled for this browser." : "Get a device alert when a user or guest messages support."}</small></span></div><button type="button" className="admin-outline-button" onClick={() => void enableAdminPush()} disabled={busy || adminPushEnabled}>{adminPushEnabled ? "Alerts enabled" : "Enable push alerts"}</button></article>
          <section className="admin-support-workspace"><article className="admin-panel admin-support-inbox"><div className="admin-panel-head"><div><h2>Conversations</h2><p>{supportChats.length} recent chats · updates automatically</p></div><button type="button" className="admin-outline-button" onClick={() => void loadSupportChats()}>Refresh</button></div><div className="admin-support-chat-list">{supportChats.map((chat) => <button type="button" key={chat.id} className={`admin-support-chat-item${selectedChatId === chat.id ? " active" : ""}`} onClick={() => { setSelectedChatId(chat.id); void loadSupportThread(chat.id); }}><span className="admin-support-chat-avatar">{chat.participantType === "guest" ? <UserRound size={17}/> : chat.email.slice(0, 1).toUpperCase()}</span><span className="admin-support-chat-copy"><strong>{chat.email}</strong><small>{chat.lastMessage || "Conversation started"}</small><small>{chat.lastMessageAt ? new Date(chat.lastMessageAt).toLocaleString() : ""}</small></span><span className={`admin-support-chat-type ${chat.participantType}`}>{chat.participantType}{chat.unread && <i aria-label="Unread message"/>}</span></button>)}{!supportChats.length && <div className="admin-empty">No support conversations yet.</div>}</div></article>
            <article className="admin-panel admin-support-thread"><div className="admin-panel-head"><div><h2>{supportThread?.email ?? "Conversation"}</h2><p>{supportThread ? `${supportThread.participantType === "guest" ? "Guest chat" : "Registered user"} · private support thread` : "Select a chat to read and reply."}</p></div></div>{supportThread ? <><div className="admin-support-messages">{supportThread.messages.map((message: SupportMessage, index) => <div className={`admin-support-message ${message.senderType === "admin" ? "admin" : "user"}`} key={`${message.createdAt}-${index}`}><span>{message.senderName}</span><p>{message.body}</p><small>{new Date(message.createdAt).toLocaleString()}</small></div>)}{!supportThread.messages.length && <div className="admin-empty">This conversation has no messages yet.</div>}</div>{supportThread.status === "open" ? <form className="admin-support-reply" onSubmit={(event) => void sendSupportReply(event)}><textarea name="body" placeholder="Write a reply…" maxLength={4000} rows={2} required/><button type="submit" className="admin-primary-button" disabled={busy}><Send size={15}/> Reply</button></form> : <p className="admin-access-hint">This conversation is closed.</p>}</> : <div className="admin-support-thread-empty"><MessageCircle size={25}/><strong>Choose a conversation</strong><span>Messages appear here so your team can respond.</span></div>}</article></section>
        </>}
        {current.id === "referrals" && can("referrals.manage") && <form className="admin-panel admin-broadcast-form" onSubmit={adjustReferralBonus}><div className="admin-panel-head"><div><h2>Manual referral balance adjustment</h2><p>Every adjustment requires a reason and is written to the admin audit trail.</p></div></div><label>Credit or debit<select name="direction"><option value="credit">Credit bonus</option><option value="debit">Debit adjustment</option></select></label><label>Amount (USD)<input name="amount" type="number" min="0.00000001" step="0.00000001" required /></label><label>Reason<textarea name="reason" minLength={3} maxLength={500} rows={3} required /></label><button className="admin-primary-button" disabled={busy || !referralUserId}>Apply adjustment to selected account</button></form>}
        {!(["overview", "users", "roles", "audit", "wallets", "deposits", "withdrawals", "notifications", "support", "referrals", "signals"].includes(current.id)) && <article className="admin-panel admin-module-empty"><span>{current.id === "deposits" ? <ArrowDownLeft /> : current.id === "withdrawals" ? <ArrowUpRight /> : current.id === "wallets" ? <Wallet /> : current.id === "signals" ? <Signal /> : current.id === "referrals" ? <UserRound /> : <BarChart3 />}</span><h2>{current.label}</h2><p>{sectionPlaceholder[current.id] ?? "This module is not connected yet."}</p></article>}
        {current.id === "overview" && <><article className="admin-panel admin-overview-note"><h2>Manage by access group</h2><p>Use Admin access to create administrator accounts and enable only the platform areas each person needs. Access checks are enforced by the backend on every admin request.</p>{permissionGroups.map((group) => <div key={group.id}><strong>{group.label}</strong><span>{group.permissions.map((permission) => permission.label).join(" · ")}</span></div>)}</article></>}
      </section>
    </main>
    <nav className="admin-mobile-nav" aria-label="Mobile admin navigation">{mobilePrimarySections.map(({id,label,icon:Icon})=><button key={id} type="button" className={section===id?"active":""} onClick={()=>{setSection(id);setQuery("");setMobileMoreOpen(false);}}><Icon size={18}/><span>{label}</span></button>)}{mobileMoreSections.length>0&&<button type="button" className={mobileMoreOpen||mobileMoreSections.some((item)=>item.id===section)?"active":""} onClick={()=>setMobileMoreOpen((open)=>!open)}><ChevronDown size={18}/><span>More</span></button>}{mobileMoreOpen&&<div className="admin-mobile-more">{mobileMoreSections.map(({id,label,icon:Icon})=><button key={id} type="button" className={section===id?"active":""} onClick={()=>{setSection(id);setQuery("");setMobileMoreOpen(false);}}><Icon size={17}/>{label}</button>)}</div>}</nav>

    {balanceTarget && can("wallets.adjust") && <div className="admin-modal-layer" onMouseDown={(event)=>{if(event.target===event.currentTarget)setBalanceTarget(null);}}><section className="admin-modal-card" role="dialog" aria-modal="true" aria-labelledby="balance-adjust-title"><header><div><p>WALLET CONTROL</p><h2 id="balance-adjust-title">Adjust {balanceTarget.fullName}</h2></div><button type="button" onClick={()=>setBalanceTarget(null)} aria-label="Close"><X/></button></header><div className="admin-access-hint">Current investment: ${balanceTarget.tradingBalance.toFixed(2)} · Referral: ${balanceTarget.referralBalance.toFixed(2)}. Every adjustment is recorded with your admin identity and reason.</div><form className="admin-modal-form" onSubmit={adjustBalance}><label>Wallet<select name="wallet"><option value="trading">Investment wallet</option><option value="referral">Referral wallet</option></select></label><label>Operation<select name="direction"><option value="credit">Credit</option><option value="debit">Debit</option></select></label><label>Amount (USD)<input name="amount" type="number" min="0.00000001" max="1000000000" step="0.00000001" required/></label><label>Reason<textarea name="reason" minLength={3} maxLength={500} rows={3} required placeholder="Record why this balance correction is needed"/></label><button className="admin-primary-button" disabled={busy}>Apply balance adjustment</button></form></section></div>}
    {selectedUser && (can("users.manage") || can("withdrawals.manage")) && <div className="admin-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedUser(null); }}><section className="admin-modal-card" key={selectedUser.id} role="dialog" aria-modal="true" aria-labelledby="user-modal-title"><header><div><p>USER ACCOUNT</p><h2 id="user-modal-title">Manage {selectedUser.fullName}</h2></div><button type="button" onClick={() => setSelectedUser(null)} aria-label="Close"><X /></button></header>{can("users.manage") && <><form className="admin-modal-form" onSubmit={updateUserProfile}><label>Full name<input name="fullName" defaultValue={selectedUser.fullName} required minLength={2} maxLength={120} /></label><label>Email<input name="email" type="email" defaultValue={selectedUser.email} required /></label><button className="admin-primary-button" disabled={busy}>Save account details</button></form><form className="admin-modal-form admin-password-form" onSubmit={updateUserPassword}><label>Set a new password<input name="password" type="password" placeholder="12+ characters, uppercase, number, symbol" required minLength={12} maxLength={128} /></label><button className="admin-outline-button" disabled={busy}>Change password</button></form><div className="admin-control-row"><div><strong>Account access</strong><span>{selectedUser.isDisabled ? "Sign-in disabled" : "Sign-in enabled"}</span></div><button type="button" className="admin-outline-button" disabled={busy} onClick={async () => { if (await action(() => adminRequest(`users/${selectedUser.id}/controls`, "PATCH", { disabled: !selectedUser.isDisabled }), selectedUser.isDisabled ? "Account enabled." : "Account disabled and signed out.")) setSelectedUser({ ...selectedUser, isDisabled: !selectedUser.isDisabled }); }}>{selectedUser.isDisabled ? "Enable account" : "Disable account"}</button></div><button type="button" className="admin-danger-button" disabled={busy} onClick={async () => { if (window.confirm(`Permanently delete ${selectedUser.fullName} and revoke their sessions? This cannot be undone.`) && await action(() => adminRequest(`users/${selectedUser.id}`, "DELETE"), "User account deleted.")) setSelectedUser(null); }}>Delete user account</button></>}{can("withdrawals.manage") && <div className="admin-control-row"><div><strong>Withdrawals</strong><span>{selectedUser.withdrawalsDisabled ? "Withdrawals disabled" : "Withdrawals enabled"}</span></div><button type="button" className="admin-outline-button" disabled={busy} onClick={async () => { if (await action(() => adminRequest(`users/${selectedUser.id}/withdrawals`, "PATCH", { withdrawalsDisabled: !selectedUser.withdrawalsDisabled }), selectedUser.withdrawalsDisabled ? "Withdrawals enabled." : "Withdrawals disabled.")) setSelectedUser({ ...selectedUser, withdrawalsDisabled: !selectedUser.withdrawalsDisabled }); }}>{selectedUser.withdrawalsDisabled ? "Enable withdrawals" : "Disable withdrawals"}</button></div>}</section></div>}

    {(newAdminOpen || selectedAdmin) && actor.isSuperAdmin && <div className="admin-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) { setNewAdminOpen(false); setSelectedAdmin(null); } }}><section className="admin-modal-card admin-access-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title"><header><div><p>ADMIN ACCESS</p><h2 id="admin-modal-title">{selectedAdmin ? `Access for ${selectedAdmin.fullName}` : "Create admin account"}</h2></div><button type="button" onClick={() => { setNewAdminOpen(false); setSelectedAdmin(null); }} aria-label="Close"><X /></button></header>{newAdminOpen && <form className="admin-modal-form" id="create-admin-form" onSubmit={createAdmin}><label>Full name<input name="fullName" required minLength={2} maxLength={120} /></label><label>Email<input name="email" type="email" required /></label><label>Temporary password<input name="password" type="password" required minLength={12} maxLength={128} placeholder="12+ characters, uppercase, number, symbol" /></label><p className="admin-access-hint">Share the temporary password securely. Admins can use the password reset flow to change it.</p></form>}<div className="admin-permission-groups">{permissionGroups.map((group) => <fieldset key={group.id}><legend>{group.label}</legend><p>{group.description}</p>{group.permissions.map((permission) => <label key={permission.code}><input type="checkbox" checked={group.id === "administrators" || newPermissions.includes(permission.code)} disabled={group.id === "administrators"} onChange={() => setPermission(permission.code)} /><span><strong>{permission.label}</strong><small>{group.id === "administrators" ? "Reserved for super admin" : permission.code}</small></span></label>)}</fieldset>)}</div><footer>{selectedAdmin && <button type="button" className="admin-outline-button" onClick={async () => { if (await action(() => adminRequest(`admins/${selectedAdmin.id}/status`, "PATCH", { disabled: !selectedAdmin.disabled }), selectedAdmin.disabled ? "Admin account enabled." : "Admin account disabled and signed out.")) setSelectedAdmin({ ...selectedAdmin, disabled: !selectedAdmin.disabled }); }}>{selectedAdmin.disabled ? "Enable account" : "Disable account"}</button>}<button type="button" className="admin-outline-button" onClick={() => { setNewAdminOpen(false); setSelectedAdmin(null); }}>Cancel</button><button type={selectedAdmin ? "button" : "submit"} form={selectedAdmin ? undefined : "create-admin-form"} className="admin-primary-button" disabled={busy} onClick={selectedAdmin ? () => void saveAdminPermissions() : undefined}>{selectedAdmin ? "Save access" : "Create administrator"}</button></footer></section></div>}
  </div>;
}
