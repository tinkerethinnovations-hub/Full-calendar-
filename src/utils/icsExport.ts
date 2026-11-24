import type { CalendarEventRecord, RecurrenceFrequency } from '../types/calendar';

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function toLocalDateTimeInput(date: Date): string {
  return `${toLocalDateString(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function normalizeEventDateForInput(
  isoOrDate: string | Date | null | undefined,
  allDay: boolean,
): string {
  if (!isoOrDate) {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return allDay ? toLocalDateString(now) : toLocalDateTimeInput(now);
  }
  if (typeof isoOrDate === 'string') {
    if (allDay) {
      return isoOrDate.slice(0, 10);
    }
    if (isoOrDate.length >= 16 && isoOrDate.includes('T')) {
      return isoOrDate.slice(0, 16);
    }
    const parsed = new Date(isoOrDate);
    if (!Number.isNaN(parsed.getTime())) {
      return toLocalDateTimeInput(parsed);
    }
    return `${isoOrDate.slice(0, 10)}T09:00`;
  }
  return allDay ? toLocalDateString(isoOrDate) : toLocalDateTimeInput(isoOrDate);
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toLocalDateString(dt);
}

export function addMinutesToDateTimeString(dateTimeStr: string, minutes: number): string {
  const parsed = new Date(dateTimeStr);
  if (Number.isNaN(parsed.getTime())) {
    return dateTimeStr;
  }
  parsed.setMinutes(parsed.getMinutes() + minutes);
  return toLocalDateTimeInput(parsed);
}

export function shiftIsoByRecurrence(
  value: string,
  step: number,
  frequency: RecurrenceFrequency,
  allDay: boolean,
): string {
  if (step === 0 || frequency === 'none') return value;

  if (allDay) {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (frequency === 'daily') dt.setDate(dt.getDate() + step);
    else if (frequency === 'weekly') dt.setDate(dt.getDate() + step * 7);
    else if (frequency === 'biweekly') dt.setDate(dt.getDate() + step * 14);
    else if (frequency === 'monthly') dt.setMonth(dt.getMonth() + step);
    return toLocalDateString(dt);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  if (frequency === 'daily') parsed.setDate(parsed.getDate() + step);
  else if (frequency === 'weekly') parsed.setDate(parsed.getDate() + step * 7);
  else if (frequency === 'biweekly') parsed.setDate(parsed.getDate() + step * 14);
  else if (frequency === 'monthly') parsed.setMonth(parsed.getMonth() + step);
  return toLocalDateTimeInput(parsed);
}

export function formatShortEventTime(startStr: string, allDay: boolean): string {
  if (allDay) {
    const [y, m, d] = startStr.slice(0, 10).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  const dt = new Date(startStr);
  if (Number.isNaN(dt.getTime())) return startStr;
  return dt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatFullEventSchedule(event: Pick<CalendarEventRecord, 'start' | 'end' | 'allDay' | 'timezone'>): string {
  if (event.allDay) {
    const [sy, sm, sd] = event.start.slice(0, 10).split('-').map(Number);
    const startDt = new Date(sy, sm - 1, sd);
    const startText = startDt.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    if (event.end && event.end.slice(0, 10) > event.start.slice(0, 10)) {
      const [ey, em, ed] = event.end.slice(0, 10).split('-').map(Number);
      const endDt = new Date(ey, em - 1, ed - 1);
      if (endDt > startDt) {
        const endText = endDt.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        return `${startText} – ${endText} · All day`;
      }
    }
    return `${startText} · All day`;
  }

  const startDt = new Date(event.start);
  const endDt = event.end ? new Date(event.end) : null;
  if (Number.isNaN(startDt.getTime())) return event.start;

  const datePart = startDt.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const startTime = startDt.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const endTime =
    endDt && !Number.isNaN(endDt.getTime())
      ? endDt.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';

  return `${datePart} · ${startTime}${endTime ? ` – ${endTime}` : ''}${event.timezone ? ` (${event.timezone})` : ''}`;
}

export function isSafeExternalUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function generateMeetingRoomUrl(seedTitle: string): string {
  const slug = seedTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `https://meet.jit.si/${slug || 'calendar-room'}-${suffix}`;
}

export function buildEventShareUrl(event: CalendarEventRecord): string {
  const origin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : '';
  return `${origin}/?share=${encodeURIComponent(event.shareToken)}`;
}

export function buildAddToGoogleCalendarUrl(event: CalendarEventRecord): string {
  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', event.title);

  if (event.allDay) {
    const startCompact = event.start.slice(0, 10).replace(/-/g, '');
    const endCompact = (event.end || addDaysToDateString(event.start, 1))
      .slice(0, 10)
      .replace(/-/g, '');
    params.set('dates', `${startCompact}/${endCompact}`);
  } else {
    const s = new Date(event.start);
    const e = event.end ? new Date(event.end) : new Date(s.getTime() + 60 * 60 * 1000);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
      params.set('dates', `${formatIcsUtc(s)}/${formatIcsUtc(e)}`);
    }
  }

  const descParts: string[] = [];
  if (event.notes) descParts.push(event.notes);
  if (event.meetingUrl && isSafeExternalUrl(event.meetingUrl)) {
    descParts.push(`Join meeting: ${event.meetingUrl}`);
  }
  if (descParts.length > 0) {
    params.set('details', descParts.join('\n\n'));
  }
  if (event.location) {
    params.set('location', event.location);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function formatIcsUtc(date: Date): string {
  return (
    date.getUTCFullYear().toString() +
    pad2(date.getUTCMonth() + 1) +
    pad2(date.getUTCDate()) +
    'T' +
    pad2(date.getUTCHours()) +
    pad2(date.getUTCMinutes()) +
    pad2(date.getUTCSeconds()) +
    'Z'
  );
}

function formatIcsLocalDate(dateStr: string): string {
  return dateStr.slice(0, 10).replace(/-/g, '');
}

export function buildIcsContent(events: CalendarEventRecord[]): string {
  const stamp = formatIcsUtc(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FullCalendar Studio//Enterprise Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.id}@fullcalendar-studio.local`);
    lines.push(`DTSTAMP:${stamp}`);

    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatIcsLocalDate(event.start)}`);
      const endDate = event.end ? event.end : addDaysToDateString(event.start, 1);
      lines.push(`DTEND;VALUE=DATE:${formatIcsLocalDate(endDate)}`);
    } else {
      const startDate = new Date(event.start);
      const endDate = event.end
        ? new Date(event.end)
        : new Date(startDate.getTime() + 60 * 60 * 1000);
      lines.push(`DTSTART:${formatIcsUtc(startDate)}`);
      lines.push(`DTEND:${formatIcsUtc(endDate)}`);
    }

    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.location) {
      lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    }

    const descriptionPieces: string[] = [];
    if (event.notes) descriptionPieces.push(event.notes);
    if (event.meetingUrl && isSafeExternalUrl(event.meetingUrl)) {
      descriptionPieces.push(`Video Meeting: ${event.meetingUrl}`);
    }
    if (descriptionPieces.length > 0) {
      lines.push(`DESCRIPTION:${escapeIcsText(descriptionPieces.join('\n\n'))}`);
    }

    if (event.meetingUrl && isSafeExternalUrl(event.meetingUrl)) {
      lines.push(`URL:${event.meetingUrl}`);
    }

    for (const attendee of event.attendees || []) {
      const cn = attendee.name ? `;CN=${escapeIcsText(attendee.name)}` : '';
      lines.push(`ATTENDEE${cn}:mailto:${attendee.email}`);
    }

    for (const reminder of event.reminders || []) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${escapeIcsText(event.title)}`);
      lines.push(`TRIGGER:-PT${Math.max(0, reminder.minutesBefore)}M`);
      lines.push('END:VALARM');
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcsFile(
  events: CalendarEventRecord[],
  filename = 'fullcalendar-schedule.ics',
): void {
  const ics = buildIcsContent(events);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
