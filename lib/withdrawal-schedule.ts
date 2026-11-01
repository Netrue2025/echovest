import { WithdrawalPolicy } from "./finance-api";

export function withdrawalWindowOpen(policy: Pick<WithdrawalPolicy, "withdrawalDays" | "withdrawalWindowStart" | "withdrawalWindowEnd" | "withdrawalTimezone"> | null | undefined, now = new Date()) {
  if (!policy) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: policy.withdrawalTimezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const day = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[parts.find((part) => part.type === "weekday")?.value ?? ""];
    const time = `${parts.find((part) => part.type === "hour")?.value ?? "00"}:${parts.find((part) => part.type === "minute")?.value ?? "00"}`;
    return policy.withdrawalDays.includes(day) && time >= policy.withdrawalWindowStart && time <= policy.withdrawalWindowEnd;
  } catch { return false; }
}

export function withdrawalScheduleLabel(policy: Pick<WithdrawalPolicy, "withdrawalDays" | "withdrawalWindowStart" | "withdrawalWindowEnd" | "withdrawalTimezone">) {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${policy.withdrawalDays.map((day) => names[day]).join(", ")} · ${policy.withdrawalWindowStart}–${policy.withdrawalWindowEnd} (${policy.withdrawalTimezone})`;
}
