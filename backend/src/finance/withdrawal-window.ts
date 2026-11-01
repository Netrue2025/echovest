import { BadRequestException } from '@nestjs/common';

export type WithdrawalWindowSettings = {
  withdrawalDays?: number[];
  withdrawalWindowStart?: string;
  withdrawalWindowEnd?: string;
  withdrawalTimezone?: string;
};

export function withdrawalWindowStatus(settings: WithdrawalWindowSettings, now = new Date()) {
  const days = settings.withdrawalDays ?? [0, 1, 2, 3, 4, 5, 6];
  const start = settings.withdrawalWindowStart ?? '00:00';
  const end = settings.withdrawalWindowEnd ?? '23:59';
  const timezone = settings.withdrawalTimezone ?? 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
  const day = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[weekday];
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  const time = `${hour}:${minute}`;
  return { open: days.includes(day) && time >= start && time <= end, days, start, end, timezone };
}

export function assertWithdrawalWindow(settings: WithdrawalWindowSettings, now = new Date()) {
  const status = withdrawalWindowStatus(settings, now);
  if (!status.open) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    throw new BadRequestException(`Withdrawals are available ${status.days.map((day) => dayNames[day]).join(', ')} between ${status.start} and ${status.end} (${status.timezone}).`);
  }
}
