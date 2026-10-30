"use client";

import { ArrowUpRight, Copy, ShieldCheck, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

const slides = [
  { eyebrow: "A clearer way to trade", title: <>Welcome to <span>EchoVest</span></>, copy: "Your trusted space for smarter copy trading, wallet access, and the network you build.", visual: "welcome" },
  { eyebrow: "Copy with control", title: <>Follow signals.<br /><span>Stay in control.</span></>, copy: "Browse platform signals, choose your allocation, and pause or stop copying whenever you need to.", visual: "signals" },
  { eyebrow: "Build your circle", title: <>Grow your network.<br /><span>Track every step.</span></>, copy: "Share your referral link, follow your downline, and keep your earnings history in one wallet.", visual: "network" },
];

function AppVisual({ type }: { type: string }) {
  const Icon = type === "signals" ? Copy : type === "network" ? Wallet : ShieldCheck;
  return <div className={`welcome-art art-${type}`} aria-hidden="true">
    <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
    <div className="art-coin coin-one"><Icon size={20} /></div><div className="art-coin coin-two"><ArrowUpRight size={19} /></div>
    <div className="welcome-device"><div className="welcome-notch" /><div className="welcome-screen"><div className="welcome-appbar"><strong>EchoVest</strong><span>...</span></div>
      {type === "welcome" && <><small>Portfolio overview</small><div className="welcome-balance">Ready to copy</div><div className="welcome-chart chart-welcome" /></>}
      {type === "signals" && <><small>Available signals</small><div className="signal-preview"><b>Momentum</b><span>Active</span></div><div className="signal-preview"><b>Balanced</b><span>Ready</span></div><div className="welcome-chart chart-signal" /></>}
      {type === "network" && <><small>Referral network</small><div className="network-preview"><span /><span /><span /></div><div className="network-row"><b>Direct circle</b><small>Track activity</small></div><div className="network-row"><b>Deeper tiers</b><small>Stay informed</small></div></>}
    </div></div>
  </div>;
}

export function WelcomeCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const updateInstalled = () => setInstalled(window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)));
    updateInstalled();
    const displayMode = window.matchMedia("(display-mode: standalone)");
    window.addEventListener("appinstalled", updateInstalled);
    displayMode.addEventListener("change", updateInstalled);
    return () => {
      window.removeEventListener("appinstalled", updateInstalled);
      displayMode.removeEventListener("change", updateInstalled);
    };
  }, []);
  useEffect(() => { if (paused) return; const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 5600); return () => window.clearInterval(timer); }, [paused]);
  const slide = slides[active];
  return <main className="welcome-page" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
    <div className="welcome-shell"><header className="welcome-header"><a href="#top" className="welcome-logo" aria-label="EchoVest home"><span className="welcome-logo-mark">E</span>EchoVest</a><span className="welcome-menu-label">{active + 1} / {slides.length}</span></header>
      <div className="welcome-track" key={active} aria-live="polite"><div className="welcome-copy"><div className="welcome-eyebrow">{slide.eyebrow}</div><h1>{slide.title}</h1><p>{slide.copy}</p><div className="welcome-dots" aria-label="Welcome slides">{slides.map((item, index) => <button key={item.eyebrow} type="button" className={index === active ? "active" : ""} onClick={() => setActive(index)} aria-label={`Show slide ${index + 1}`} aria-current={index === active ? "true" : undefined} />)}</div></div><div className="welcome-visual-wrap"><AppVisual type={slide.visual} /></div></div>
      <div className="welcome-actions">{installed ? <><a className="welcome-primary" href="/sign-up">Get started</a><a className="welcome-secondary" href="/sign-in">Sign in</a></> : <><a className="welcome-primary" href="/#download">Install EchoVest first</a><a className="welcome-secondary" href="/">Back to landing page</a></>}</div>
    </div>
  </main>;
}
