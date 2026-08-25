export interface RecurringPattern {
  startDate: string; // "YYYY-MM-DD"
  time: string; // "HH:mm"
  durationMinutes: number;
  occurrences: number;
  intervalDays: number;
  namePrefix: string;
}

export interface GeneratedSubEvent {
  name: string;
  startsAt: string;
  endsAt: string;
  doorsOpenAt: string | null;
  sortOrder: number;
}

export function generateRecurringSubEvents(pattern: RecurringPattern): GeneratedSubEvent[] {
  const [hours, minutes] = pattern.time.split(":").map(Number);
  return Array.from({ length: pattern.occurrences }, (_, i) => {
    const start = new Date(`${pattern.startDate}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() + i * pattern.intervalDays);
    start.setUTCHours(hours ?? 0, minutes ?? 0, 0, 0);
    const end = new Date(start.getTime() + pattern.durationMinutes * 60_000);
    return {
      name: `${pattern.namePrefix} ${i + 1}`,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      doorsOpenAt: null,
      sortOrder: i
    };
  });
}
