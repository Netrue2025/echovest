import { DownloadGate } from "./DownloadGate";
import { siteConfig } from "../config/site";

export function Hero() {
  return <section id="top" className="grid-lines landing-hero" style={{ padding: "78px 0 72px", overflow: "hidden" }}>
    <div className="container landing-hero-layout">
      <div className="hero-product-art"><img src="/echovest-mobile-hero.jfif" alt="EchoVest Bitcoin trading screen showing candlestick prices and 24-hour volume" /><span className="hero-market-pill"><i /> BTC/USDT <b>+4.5%</b></span></div>
      <div className="hero-copy">
        <div className="eyebrow landing-live-label">iOS &amp; Android · Version {siteConfig.version} is live</div>
        <h1 className="landing-hero-title">Copy the signals.<br /><span>Grow your circle.</span></h1>
        <p className="landing-hero-description">EchoVest mirrors expert trading signals into your account automatically and rewards you for the network you build — all in one wallet.</p>
        <DownloadGate />
      </div>
    </div>
  </section>;
}
