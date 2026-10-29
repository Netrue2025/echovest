"use client";

import { useEffect, useRef, useState } from "react";

const slides = [
  {
    title: <>Copy signals with <span>more control</span></>,
    copy: "Explore trading strategies, choose an allocation, and pause or stop copying whenever you need to.",
    cta: "Get Started",
    image: "/slides/echovest-trading-showcase.png",
    alt: "EchoVest trading app with a rising portfolio chart",
  },
  {
    title: <>Your wallet, <span>in view</span></>,
    copy: "Keep track of deposits, balances, and transaction updates in one place.",
    cta: "Get Started",
    image: "/slides/echovest-withdrawal-success.png",
    alt: "EchoVest app showing a successful withdrawal",
  },
  {
    title: <>Stay on top of <span>your activity</span></>,
    copy: "Follow deposit and withdrawal statuses, and see when an update is ready.",
    cta: "Get Started",
    image: "/slides/echovest-confidence.png",
    alt: "EchoVest trading app held by a confident investor",
  },
] as const;

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("a, button, input, textarea, select"));
}

export function WelcomeCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const gesture = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onVisibilityChange = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (paused || hidden || reducedMotion) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 5000);
    return () => window.clearInterval(timer);
  }, [paused, hidden, reducedMotion, resetKey]);

  const goTo = (index: number) => {
    setActive((index + slides.length) % slides.length);
    setResetKey((key) => key + 1);
  };

  const move = (direction: 1 | -1) => goTo(active + direction);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (isInteractiveTarget(event.target)) return;
    gesture.current = { x: event.clientX, y: event.clientY };
    setPaused(true);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const start = gesture.current;
    gesture.current = null;
    setPaused(false);
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.25) move(dx < 0 ? 1 : -1);
  };

  return (
    <main
      className="welcome-page welcome-light"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
      }}
    >
      <div className="welcome-shell">
        <a className="welcome-brand" href="/pwa" aria-label="EchoVest home"><span className="brand-icon-crop"><img src="/echovest-icon.png" alt="" /></span><span>EchoVest</span></a>
        <section
          className="welcome-carousel"
          aria-label="EchoVest welcome carousel"
          tabIndex={0}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { gesture.current = null; setPaused(false); }}
        >
          <div className="welcome-track" style={{ transform: `translate3d(-${active * (100 / slides.length)}%, 0, 0)` }}>
            {slides.map((slide, index) => (
              <article className="welcome-slide" key={slide.image} aria-hidden={index !== active}>
                <div className="welcome-copy">
                  <h1>{slide.title}</h1>
                  <p>{slide.copy}</p>
                </div>
                <div className="welcome-visual-wrap">
                  <div className={`welcome-art art-slide-${index}`}>
                    <img className="welcome-slide-image" src={slide.image} alt={slide.alt} draggable={false} />
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="welcome-dots" aria-label="Carousel pagination">
            {slides.map((slide, index) => (
              <button
                key={slide.image}
                type="button"
                className={index === active ? "active" : ""}
                onClick={() => goTo(index)}
                aria-label={`Go to slide ${index + 1} of ${slides.length}`}
                aria-current={index === active ? "true" : undefined}
              />
            ))}
          </div>
        </section>

        <div className="welcome-actions">
          <a className="welcome-primary" href="/sign-up">{slides[active].cta}</a>
          <a className="welcome-secondary" href="/sign-in">Sign In</a>
        </div>
      </div>
    </main>
  );
}
