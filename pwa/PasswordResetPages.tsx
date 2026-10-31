"use client";

import { ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppPreloader } from "../components/AppPreloader";
import { authRequest } from "../lib/auth-api";
import styles from "./PasswordResetPages.module.css";
import { AuthSuccess } from "./AuthSuccess";

function PasswordField({ id, label, placeholder, value, onChange }: { id: string; label: string; placeholder: string; value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return <div className={styles.field}><label htmlFor={id}>{label}</label><div className={styles.passwordWrap}><input id={id} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete="new-password" minLength={8} maxLength={128} required /><button className={styles.eye} type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={21} /> : <Eye size={21} />}</button></div></div>;
}

function PasswordRules({ password }: { password: string }) {
  const checks = [["8+ characters", password.length >= 8], ["1 uppercase letter", /[A-Z]/.test(password)], ["1 number", /\d/.test(password)], ["1 special character", /[^A-Za-z0-9]/.test(password)]] as const;
  return <div className={styles.rules} aria-live="polite"><p>Password must contain:</p><div>{checks.map(([label, met]) => <span className={met ? styles.met : ""} key={label}><i aria-hidden="true">{met ? "✓" : "○"}</i>{label}</span>)}</div></div>;
}

export function ForgotPasswordPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim().toLowerCase();
    setBusy(true); setNotice("");
    try {
      await authRequest("forgot-password", { email });
      sessionStorage.setItem("echovest-password-reset-email", email);
      router.push("/reset-password");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to send a reset code. Please try again."); }
    finally { setBusy(false); }
  }
  return <>{busy && <AppPreloader label="Sending reset code…" />}<main className={styles.page}><section className={styles.card} aria-labelledby="forgot-title">
    <div className={styles.illustration} aria-hidden="true"><div className={styles.envelope} /><div className={styles.lockTile}><LockKeyhole size={38} strokeWidth={2.4} /></div></div>
    <header className={styles.heading}><h1 id="forgot-title">Forgot Password?</h1><p>No worries! Enter your email and we’ll send you a code to reset your password.</p></header>
    <form className={styles.form} onSubmit={submit}><div className={styles.field}><label htmlFor="reset-email">Email</label><input id="reset-email" name="email" type="email" autoComplete="email" placeholder="Enter your email" required /></div><button className={styles.submit} type="submit" disabled={busy}>Send Reset Code</button>{notice && <p className={styles.notice} role="status">{notice}</p>}</form>
    <p className={styles.switch}>Remember your password? <a href="/sign-in">Sign In</a></p>
  </section></main></>;
}

export function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => {
    const saved = sessionStorage.getItem("echovest-password-reset-email") ?? "";
    setEmail(saved);
    if (!saved) router.replace("/forgot-password");
  }, [router]);
  function updateDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setDigits((current) => current.map((item, position) => position === index ? digit : item)); setNotice("");
    if (digit && index < 5) inputs.current[index + 1]?.focus();
  }
  function keyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < 5) inputs.current[index + 1]?.focus();
  }
  function paste(event: ClipboardEvent<HTMLDivElement>) {
    const code = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("");
    if (!code.length) return;
    event.preventDefault(); setDigits(Array.from({ length: 6 }, (_, index) => code[index] ?? "")); inputs.current[Math.min(code.length, 5)]?.focus();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) { setNotice("Your passwords do not match."); return; }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) { setNotice("Please meet all password requirements."); return; }
    setBusy(true); setNotice("");
    try {
      await authRequest("reset-password", { email, code: digits.join(""), newPassword: password, passwordConfirmation: confirmation });
      sessionStorage.removeItem("echovest-password-reset-email");
      setResetComplete(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to reset your password. Please try again."); }
    finally { setBusy(false); }
  }
  if (!email) return <main className={styles.page} aria-busy="true" />;
  if (resetComplete) return <AuthSuccess title="Password Changed!" description="Your password has been successfully updated. Sign in with your new password to continue." action="Continue to Sign In" onContinue={() => router.replace("/sign-in")} />;
  return <>{busy && <AppPreloader label="Resetting your password…" />}<main className={styles.page}><section className={styles.card} aria-labelledby="reset-title">
    <header className={styles.heading}><h1 id="reset-title">Reset Your Password</h1><p>Enter the code we sent to <strong>{email}</strong> and your new password below.</p></header>
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.codeInputs} onPaste={paste} role="group" aria-label="6-digit reset code">{digits.map((digit, index) => <input key={index} ref={(element) => { inputs.current[index] = element; }} aria-label={`Code digit ${index + 1}`} inputMode="numeric" autoComplete={index === 0 ? "one-time-code" : "off"} pattern="[0-9]*" maxLength={1} value={digit} onChange={(event) => updateDigit(index, event.target.value)} onKeyDown={(event) => keyDown(index, event)} placeholder="–" required />)}</div>
      <PasswordField id="new-password" label="New Password" placeholder="Enter new password" value={password} onChange={setPassword} /><PasswordRules password={password} />
      <PasswordField id="confirm-new-password" label="Confirm Password" placeholder="Confirm new password" value={confirmation} onChange={setConfirmation} />
      <button className={styles.submit} type="submit" disabled={busy || digits.some((digit) => !digit)}>Reset Password</button>{notice && <p className={styles.notice} role="status">{notice}</p>}
    </form><button className={styles.back} type="button" onClick={() => router.push("/forgot-password")}>Send a new code</button>
  </section></main></>;
}
