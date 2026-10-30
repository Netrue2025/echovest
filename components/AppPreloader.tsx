import styles from "./AppPreloader.module.css";

export function AppPreloader({ label = "Loading EchoVest…" }: { label?: string }) {
  return <main className={styles.screen} role="status" aria-live="polite" aria-label={label}>
    <div className={styles.content}>
      <span className={styles.mark}><img src="/echovest-icon.png" alt="" /></span>
      <span className={styles.wordmark}>EchoVest</span>
      <span className={styles.label}>{label}</span>
    </div>
  </main>;
}
