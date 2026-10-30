"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
}

export function InstalledAppGate({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandaloneApp());
    setChecked(true);
  }, []);

  if (!checked) return <main className="auth-install-gate" aria-label="Loading EchoVest" />;
  if (installed) return children;

  return <main className="auth-install-gate"><section><span className="auth-install-gate-icon"><img src="/echovest-icon.png" alt="" /></span><p className="auth-install-gate-kicker">ECHOVEST APP</p><h1>Install EchoVest first</h1><p>Create your account or sign in from the installed EchoVest app.</p><a href="/#download">Go to app install</a></section></main>;
}
