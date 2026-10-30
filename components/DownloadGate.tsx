"use client";

import { Download, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function DownloadGate() {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpText, setHelpText] = useState("");
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
    setInstalled(isStandalone);
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null); setHelpOpen(false); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) {
      const userAgent = navigator.userAgent;
      const guidance = installed
        ? "EchoVest is installed. Launch it from your home screen to continue."
        : !window.isSecureContext
        ? "Open the secure HTTPS version of EchoVest to install it. Browsers block PWA installation from a local network address."
        : /iphone|ipad/i.test(userAgent)
          ? "In Safari, tap Share, then Add to Home Screen."
          : "Open your browser menu and choose Install app or Add to Home screen.";
      setHelpText(guidance);
      setHelpOpen((open) => !open);
      return;
    }
    setBusy(true);
    try {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
    } finally { setBusy(false); }
  }

  return <div className="landing-install-card" id="download">
    <div className="landing-install-copy"><span className="landing-install-icon"><Smartphone size={18} /></span><div><strong>{installed ? "EchoVest is installed" : "Get EchoVest on your phone"}</strong><small>{installed ? "Launch it from your home screen to continue." : "Install the app-like PWA directly from this page."}</small></div></div>
    <div className="landing-install-actions">
      <button type="button" className="landing-install-button" onClick={install} disabled={busy} aria-expanded={helpOpen}>
        <Download size={17} />{busy ? "Opening install…" : installPrompt ? "Install EchoVest" : installed ? "How to open" : "How to install"}
      </button>
    </div>
    {helpOpen && <div className="landing-install-help" role="status"><strong>Install on this device</strong><span>{helpText}</span></div>}
  </div>;
}
