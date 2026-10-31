"use client";

import { Check } from "lucide-react";
import styles from "./AuthSuccess.module.css";

export function AuthSuccess({ title, description, action, onContinue }: { title: string; description: string; action: string; onContinue: () => void }) {
  return <main className={styles.page}><section className={styles.card} aria-labelledby="success-title">
    <div className={styles.art} aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <span className={styles.burst} key={index} />)}<div className={styles.check}><Check /></div></div>
    <header className={styles.heading}><h1 id="success-title">{title}</h1><p>{description}</p></header>
    <button className={styles.action} type="button" onClick={onContinue}>{action}</button>
  </section></main>;
}
