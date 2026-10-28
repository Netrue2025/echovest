"use client";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

export function Header() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const links = [["Features", "#features"], ["Levels", "#levels"], ["How it works", "#how"], ["FAQ", "#faq"]];
  useEffect(() => { const saved = localStorage.getItem("echovest_theme") as "dark" | "light" | null; const next = saved || "dark"; setTheme(next); document.body.classList.toggle("theme-light", next === "light"); }, []);
  function toggleTheme() { const next = theme === "dark" ? "light" : "dark"; setTheme(next); localStorage.setItem("echovest_theme", next); document.body.classList.toggle("theme-light", next === "light"); }
  return <header style={{ position: "sticky", top: 0, zIndex: 20, background: "#0B0E11dd", backdropFilter: "blur(14px)", borderBottom: "1px solid #2B3139" }}><div className="container" style={{ height: 68, display: "flex", alignItems: "center", justifyContent: "space-between" }}><Logo /><nav aria-label="Main navigation" style={{ display: "flex", alignItems: "center", gap: 14 }}><div className="desktop-nav" style={{ display: "flex", gap: 24, marginRight: 8 }}>{links.map(([label, href]) => <a className="focus-ring muted" key={href} href={href} style={{ fontSize: 14, textDecoration: "none" }}>{label}</a>)}</div><button type="button" className="theme-toggle focus-ring" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-pressed={theme === "light"}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}<span className="theme-label">{theme === "dark" ? "Light" : "Dark"}</span></button><a className="focus-ring" href="#download" style={{ background: "#F0B90B", color: "#1E2329", fontWeight: 700, padding: "11px 16px", borderRadius: 8, textDecoration: "none", fontSize: 14 }}>Get the app</a><button className="focus-ring mobile-menu" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} style={{ display: "none", background: "none", border: 0, color: "#EAECEF" }}>{open ? <X /> : <Menu />}</button></nav></div>{open && <nav className="container mobile-links" aria-label="Mobile navigation">{links.map(([label, href]) => <a key={href} onClick={() => setOpen(false)} href={href} className="muted" style={{ textDecoration: "none" }}>{label}</a>)}</nav>}</header>;
}
