"use client";

import { Eye, EyeOff } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { countries } from "../lib/countries";
import { authRequest } from "../lib/auth-api";
import { AppPreloader } from "../components/AppPreloader";

function PasswordField({ id, label, placeholder, value, onChange, autoComplete }: {
  id: string; label: string; placeholder: string; value: string; onChange: (value: string) => void; autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className="auth-password-wrap">
      <input id={id} name={id} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} minLength={id === "signup-password" ? 8 : undefined} required />
      <button type="button" className="auth-eye" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Hide password" : "Show password"}>
        {visible ? <EyeOff size={21} /> : <Eye size={21} />}
      </button>
    </div>
  </div>;
}

function PasswordChecks({ password }: { password: string }) {
  const checks = [
    ["8 or more characters", password.length >= 8],
    ["One uppercase letter", /[A-Z]/.test(password)],
    ["One number", /\d/.test(password)],
    ["One special character", /[^A-Za-z0-9]/.test(password)],
  ] as const;
  return <div className="auth-password-rules" aria-live="polite"><p>Password must contain:</p><div>{checks.map(([label, met]) => <span className={met ? "met" : ""} key={label}><i aria-hidden="true">{met ? "✓" : "○"}</i>{label}</span>)}</div></div>;
}

export function SignUpPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [country, setCountry] = useState("NG");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedCountry = useMemo(() => countries.find((item) => item.code === country) ?? countries[0], [country]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setNotice("Please meet all password requirements before continuing.");
      return;
    }
    if (password !== confirmPassword) {
      setNotice("Your passwords do not match.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    try {
      const email = String(formData.get("email") ?? "").trim().toLowerCase();
      await authRequest("signup", { fullName: formData.get("name"), email, password, passwordConfirmation: confirmPassword });
      sessionStorage.setItem("echovest-pending-email", email);
      router.push("/verify-email");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create your account. Please try again.");
    } finally { setBusy(false); }
  }

  return <>{busy && <AppPreloader label="Creating your account…" />}<main className="auth-page">
    <section className="auth-card" aria-labelledby="signup-title">
      <div className="auth-heading"><h1 id="signup-title">Create your account</h1><p>Get started with EchoVest</p></div>
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field"><label htmlFor="full-name">Full name</label><input id="full-name" name="name" type="text" autoComplete="name" placeholder="Enter your full name" minLength={2} required /></div>
        <div className="auth-field"><label htmlFor="signup-email">Email</label><input id="signup-email" name="email" type="email" autoComplete="email" placeholder="Enter your email" required /></div>
        <div className="auth-field"><label htmlFor="signup-phone">Phone number</label><div className="auth-phone-wrap">
          <label className="sr-only" htmlFor="signup-country">Country calling code</label>
          <select id="signup-country" value={country} onChange={(event) => setCountry(event.target.value)} aria-label={`Country calling code, currently ${selectedCountry.name}`}>
            {countries.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.dialCode})</option>)}
          </select>
          <input id="signup-phone" name="phone" type="tel" autoComplete="tel-national" inputMode="tel" placeholder="Enter your phone number" required />
        </div></div>
        <PasswordField id="signup-password" label="Password" placeholder="Create a password" value={password} onChange={setPassword} autoComplete="new-password" />
        <PasswordChecks password={password} />
        <PasswordField id="confirm-password" label="Confirm password" placeholder="Confirm your password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
        <div className="auth-field"><label htmlFor="referral-code">Referral code <span className="auth-optional">Optional</span></label><input id="referral-code" name="referralCode" type="text" autoComplete="off" placeholder="Enter a referral code" /></div>
        <label className="auth-consent"><input type="checkbox" name="terms" required /><span>I agree to the EchoVest terms and privacy policy.</span></label>
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
        {notice && <p className="auth-notice" role="status">{notice}</p>}
      </form>
      <p className="auth-switch">Already have an account? <a href="/sign-in">Sign in</a></p>
    </section>
  </main></>;
}

export function SignInPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    try {
      await authRequest("signin", { email: String(formData.get("email") ?? "").trim().toLowerCase(), password });
      router.push("/dashboard");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to sign in. Please try again.");
    } finally { setBusy(false); }
  }
  return <>{busy && <AppPreloader label="Signing you in…" />}<main className="auth-page auth-page-login">
    <section className="auth-card auth-card-login" aria-labelledby="signin-title">
      <div className="auth-heading"><h1 id="signin-title">Welcome back</h1><p>Sign in to continue to EchoVest</p></div>
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field"><label htmlFor="signin-email">Email</label><input id="signin-email" name="email" type="email" autoComplete="email" placeholder="Enter your email" required /></div>
        <PasswordField id="signin-password" label="Password" placeholder="Enter your password" value={password} onChange={setPassword} autoComplete="current-password" />
        <div className="auth-login-options"><label className="auth-remember"><input type="checkbox" name="remember" /><span>Remember me</span></label><a className="auth-text-button" href="/forgot-password">Forgot password?</a></div>
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        {notice && <p className="auth-notice" role="status">{notice}</p>}
      </form>
      <p className="auth-switch">New to EchoVest? <a href="/sign-up">Create an account</a></p>
    </section>
  </main></>;
}
