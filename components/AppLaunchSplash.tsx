import styles from "./AppLaunchSplash.module.css";

export function AppLaunchSplash() {
  return <main className={styles.screen} role="status" aria-label="Opening EchoVest">
    <span className={styles.logo}><img src="/echovest-icon.png" alt="EchoVest" /></span>
  </main>;
}
