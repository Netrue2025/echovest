const REFERRAL_STORAGE_KEY = "echovest-pending-referral";
const REFERRAL_COOKIE_KEY = "echovest_referral_code";
const APP_SETUP_COMPLETE_KEY = "echovest-app-setup-complete";

export function hasCompletedAppSetup() {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(APP_SETUP_COMPLETE_KEY) === "true"; } catch { return false; }
}

export function markAppSetupComplete() {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(APP_SETUP_COMPLETE_KEY, "true"); } catch { /* The sign-in route remains the fallback. */ }
}

export function savePendingReferral(code: string) {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
  if (!normalized || typeof window === "undefined") return "";
  try { window.localStorage.setItem(REFERRAL_STORAGE_KEY, normalized); } catch { /* Cookie fallback for restricted storage modes. */ }
  document.cookie = `${REFERRAL_COOKIE_KEY}=${encodeURIComponent(normalized)}; Max-Age=2592000; Path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  return normalized;
}

export function getPendingReferral() {
  if (typeof window === "undefined") return "";
  try {
    const saved = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (saved) return saved;
  } catch { /* Continue with cookie fallback. */ }
  const prefix = `${REFERRAL_COOKIE_KEY}=`;
  const value = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix))?.slice(prefix.length);
  try { return value ? decodeURIComponent(value).toUpperCase() : ""; } catch { return ""; }
}

export function clearPendingReferral() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(REFERRAL_STORAGE_KEY); } catch { /* Cookie still gets cleared. */ }
  document.cookie = `${REFERRAL_COOKIE_KEY}=; Max-Age=0; Path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
}

export function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
}
