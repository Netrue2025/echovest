import { SignInPage } from "../../pwa/AuthPages";
import { InstalledAppGate } from "../../components/InstalledAppGate";

export default function SignInRoute() {
  return <InstalledAppGate><SignInPage /></InstalledAppGate>;
}
