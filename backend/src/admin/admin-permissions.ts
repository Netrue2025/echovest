export const ADMIN_PERMISSION_GROUPS = [
  { id: 'dashboard', label: 'Dashboard', description: 'View platform overview and summary', permissions: [{ code: 'dashboard.view', label: 'View overview' }] },
  { id: 'users', label: 'User accounts', description: 'Search and manage registered users', permissions: [{ code: 'users.view', label: 'View users' }, { code: 'users.manage', label: 'Edit, disable, reset passwords, and delete users' }] },
  { id: 'wallets', label: 'Wallets and finance', description: 'Manage wallet settings and transaction operations', permissions: [{ code: 'wallets.view', label: 'View wallets and finance settings' }, { code: 'wallets.manage', label: 'Edit deposit wallet details and transaction limits' }, { code: 'deposits.manage', label: 'Review and approve deposits' }, { code: 'withdrawals.manage', label: 'Review withdrawals and manage withdrawal access' }] },
  { id: 'notifications', label: 'Notifications', description: 'Send important messages to registered users', permissions: [{ code: 'notifications.manage', label: 'Broadcast notifications to users' }] },
  { id: 'trading', label: 'Copy trading', description: 'Manage copy-trading signals and strategies', permissions: [{ code: 'signals.manage', label: 'Manage signals' }] },
  { id: 'referrals', label: 'Referrals and levels', description: 'View referral networks and membership levels', permissions: [{ code: 'referrals.view', label: 'View referrals and levels' }] },
  { id: 'oversight', label: 'Reports and audit', description: 'View reports and administrative audit records', permissions: [{ code: 'reports.view', label: 'View reports' }, { code: 'audit.view', label: 'View audit log' }] },
  { id: 'administrators', label: 'Administrator access', description: 'Super-admin only: create administrators and assign section access', permissions: [{ code: 'admins.manage', label: 'Manage admin accounts (super-admin only)' }] },
] as const;

export const ADMIN_PERMISSION_CODES = ADMIN_PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => permission.code));
export const DELEGATABLE_ADMIN_PERMISSION_CODES = ADMIN_PERMISSION_CODES.filter((code) => code !== 'admins.manage');
