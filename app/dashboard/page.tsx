import { Dashboard } from "../../pwa/Dashboard";

export default function DashboardRoute({ searchParams }: { searchParams: { view?: string } }) {
  return <Dashboard initialView={searchParams.view ?? "overview"} />;
}
