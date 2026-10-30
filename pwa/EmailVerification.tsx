"use client";

import { ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authRequest } from "../lib/auth-api";

export function EmailVerificationPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const pendingEmail = sessionStorage.getItem("echovest-pending-email") ?? "";
    setEmail(pendingEmail);
    if (!pendingEmail) router.replace("/sign-up");
  }, [router]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  function updateDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setDigits((current) => current.map((item, position) => position === index ? digit : item));
    setNotice("");
    if (digit && index < 5) inputs.current[index + 1]?.focus();
  }
  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < 5) inputs.current[index + 1]?.focus();
  }
  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("");
    if (!pasted.length) return;
    event.preventDefault();
    setDigits(Array.from({ length: 6 }, (_, index) => pasted[index] ?? ""));
    inputs.current[Math.min(pasted.length, 5)]?.focus();
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      await authRequest("verify-email", { email, code: digits.join("") });
      sessionStorage.removeItem("echovest-pending-email");
      router.replace("/dashboard");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to verify this code. Please try again.");
    } finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true);
    setNotice("");
    try {
      await authRequest("resend-otp", { email });
      setSecondsLeft(60);
      setDigits(["", "", "", "", "", ""]);
      setNotice("If your account can receive a code, a new code has been sent.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to resend the code right now.");
    } finally { setBusy(false); }
  }

  if (!email) return <main className="verify-page" aria-busy="true" />;
  const complete = digits.every(Boolean);
  return <main className="verify-page">
    <section className="verify-card" aria-labelledby="verify-title">
      <div className="verify-heading"><h1 id="verify-title">Verify your email</h1><p>Enter the 6-digit code we sent to</p><strong>{email}</strong></div>
      <form onSubmit={verify}>
        <div className="verify-code-inputs" onPaste={onPaste} role="group" aria-label="6-digit verification code">
          {digits.map((digit, index) => <input key={index} ref={(element) => { inputs.current[index] = element; }} aria-label={`Digit ${index + 1}`} inputMode="numeric" autoComplete={index === 0 ? "one-time-code" : "off"} pattern="[0-9]*" maxLength={1} value={digit} onChange={(event) => updateDigit(index, event.target.value)} onKeyDown={(event) => onKeyDown(index, event)} placeholder="–" />)}
        </div>
        <p className="verify-resend-caption">Your code expires in 10 minutes.</p>
        <button className="verify-submit" type="submit" disabled={!complete || busy}>{busy ? "Verifying…" : "Verify"}</button>
        {notice && <p className="verify-notice" role="status">{notice}</p>}
      </form>
      <p className="verify-resend">Didn’t receive a code? <button type="button" disabled={busy || secondsLeft > 0} onClick={resend}>{secondsLeft > 0 ? `Resend in 00:${String(secondsLeft).padStart(2, "0")}` : "Resend"}</button></p>
      <button className="verify-back" type="button" onClick={() => router.push("/sign-up")}>Back to sign up</button>
    </section>
  </main>;
}
