import { WelcomeCarousel } from "../../pwa/WelcomeCarousel";
import styles from "./launch.module.css";

export default function PwaWelcomePage() {
  return <div className={styles.launchSurface}><WelcomeCarousel /></div>;
}
