"use client";

import { FormEvent, KeyboardEvent, ClipboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function EmailVerificationPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [notice, setNotice] = useState("");
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const pendingEmail = sessionStorage.getItem("echovest-pending-email") ?? "";
    setEmail(pendingEmail);
    if (!pendingEmail) router.replace("/sign-up");
  }, [router]);

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

  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("Email verification will be enabled after EchoVest's email and account services are connected.");
  }

  if (!email) return <main className="verify-page" aria-busy="true" />;
  const complete = digits.every(Boolean);
  return <main className="verify-page">
    <section className="verify-card" aria-labelledby="verify-title">
      <div className="verify-heading"><h1 id="verify-title">Verify your email</h1><p>A 6-digit verification code will be sent to</p><strong>{email}</strong></div>
      <div className="verify-preview-note" role="status">Preview only: email delivery is not configured yet, so no code has been sent.</div>
      <form onSubmit={verify}>
        <div className="verify-code-inputs" onPaste={onPaste} role="group" aria-label="6-digit verification code">
          {digits.map((digit, index) => <input key={index} ref={(element) => { inputs.current[index] = element; }} aria-label={`Digit ${index + 1}`} inputMode="numeric" autoComplete={index === 0 ? "one-time-code" : "off"} pattern="[0-9]*" maxLength={1} value={digit} onChange={(event) => updateDigit(index, event.target.value)} onKeyDown={(event) => onKeyDown(index, event)} placeholder="–" />)}
        </div>
        <p className="verify-resend-caption">You’ll be able to request a new code after email verification is connected.</p>
        <button className="verify-submit" type="submit" disabled={!complete}>Verify email</button>
        {notice && <p className="verify-notice" role="status">{notice}</p>}
      </form>
      <p className="verify-resend">Didn’t receive a code? <button type="button" disabled>Resend</button></p>
      <button className="verify-back" type="button" onClick={() => router.push("/sign-up")}>Back to sign up</button>
    </section>
  </main>;
}
