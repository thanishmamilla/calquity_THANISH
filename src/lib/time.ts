/** Dataset snapshot — use this as "now" for every time-based decision. */
export const SNAPSHOT_ISO = "2026-08-16T11:00:00+05:30";
export const SNAPSHOT = new Date(SNAPSHOT_ISO);
export const SNAPSHOT_LABEL = "16 Aug 2026, 11:00 Asia/Kolkata";

const IST = "Asia/Kolkata";

export function parseIst(value: string): Date {
  if (value.includes("T") || value.includes("+")) return new Date(value);
  return new Date(value.replace(" ", "T") + "+05:30");
}

export function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 60000;
}

export function hoursBetween(from: Date, to: Date): number {
  return minutesBetween(from, to) / 60;
}

export function formatIst(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function weekdayInIst(date: Date): number {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: IST,
    weekday: "short",
  }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

export function istParts(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0),
    minute: Number(parts.find((p) => p.type === "minute")?.value ?? 0),
  };
}

const BUSINESS_START = 9;
const BUSINESS_END = 18;

export function isBusinessTime(date: Date): boolean {
  const weekday = weekdayInIst(date);
  if (weekday === 0 || weekday === 6) return false;
  const { hour } = istParts(date);
  return hour >= BUSINESS_START && hour < BUSINESS_END;
}

export function addClockMinutes(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60_000);
}

/** Advance only through Mon–Fri 09:00–18:00 IST. */
export function addBusinessMinutes(start: Date, minutes: number): Date {
  let cursor = new Date(start.getTime());
  let remaining = minutes;
  let guard = 0;
  while (remaining > 0 && guard < 20_000) {
    guard += 1;
    if (!isBusinessTime(cursor)) {
      cursor = nextBusinessOpen(cursor);
      continue;
    }
    cursor = addClockMinutes(cursor, 1);
    remaining -= 1;
  }
  return cursor;
}

function nextBusinessOpen(date: Date): Date {
  let cursor = new Date(date.getTime());
  for (let i = 0; i < 14; i += 1) {
    const weekday = weekdayInIst(cursor);
    const { hour, minute } = istParts(cursor);
    if (weekday !== 0 && weekday !== 6 && hour < BUSINESS_START) {
      const deltaMin = (BUSINESS_START - hour) * 60 - minute;
      return addClockMinutes(cursor, deltaMin);
    }
    if (weekday !== 0 && weekday !== 6 && hour >= BUSINESS_START && hour < BUSINESS_END) {
      return cursor;
    }
    const minutesToMidnight = (24 - hour) * 60 - minute;
    cursor = addClockMinutes(cursor, minutesToMidnight);
  }
  return cursor;
}
