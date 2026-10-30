import { SignUpPage } from "../../pwa/AuthPages";
import { InstalledAppGate } from "../../components/InstalledAppGate";

export default function SignUpRoute() {
  return <InstalledAppGate><SignUpPage /></InstalledAppGate>;
}
