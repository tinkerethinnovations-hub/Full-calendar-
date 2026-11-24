import type {
  AttendeeRsvpStatus,
  CalendarEventRecord,
  DeliveryLogEntry,
  EmailAutomationConfig,
  WebhookSubscription,
  WebhookTriggerType,
} from '../types/calendar';

const DEFAULT_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'FullCalendarStudio',
};

export class ApiConflictError extends Error {
  latest: CalendarEventRecord;
  constructor(message: string, latest: CalendarEventRecord) {
    super(message);
    this.name = 'ApiConflictError';
    this.latest = latest;
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 409 && data.latest) {
    throw new ApiConflictError(
      String(data.error || 'Concurrent modification detected.'),
      data.latest as CalendarEventRecord,
    );
  }
  if (!res.ok) {
    throw new Error(String(data.error || `Request failed (${res.status})`));
  }
  return data as T;
}

export async function apiFetchEvents(): Promise<CalendarEventRecord[]> {
  const res = await fetch('/api/events', { headers: DEFAULT_HEADERS });
  const data = await parseJson<{ events: CalendarEventRecord[] }>(res);
  return data.events;
}

export async function apiCreateEvents(
  events: Partial<CalendarEventRecord>[],
  notifyAttendees = true,
): Promise<CalendarEventRecord[]> {
  const res = await fetch('/api/events', {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ events, notifyAttendees }),
  });
  const data = await parseJson<{ events: CalendarEventRecord[] }>(res);
  return data.events;
}

export async function apiUpdateEvent(
  id: string,
  patch: Partial<CalendarEventRecord> & {
    expectedVersion?: number;
    notifyAttendees?: boolean;
  },
): Promise<CalendarEventRecord> {
  const res = await fetch(`/api/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(patch),
  });
  const data = await parseJson<{ event: CalendarEventRecord }>(res);
  return data.event;
}

export async function apiDeleteEvent(id: string): Promise<void> {
  const res = await fetch(`/api/events/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: DEFAULT_HEADERS,
  });
  await parseJson<{ deleted: boolean }>(res);
}

export async function apiResetDemoEvents(): Promise<CalendarEventRecord[]> {
  const res = await fetch('/api/events/reset', {
    method: 'POST',
    headers: DEFAULT_HEADERS,
  });
  const data = await parseJson<{ events: CalendarEventRecord[] }>(res);
  return data.events;
}

export async function apiFetchSharedEvent(
  token: string,
): Promise<{ event: CalendarEventRecord; icsUrl: string }> {
  const res = await fetch(`/api/share/${encodeURIComponent(token)}`, {
    headers: DEFAULT_HEADERS,
  });
  return parseJson<{ event: CalendarEventRecord; icsUrl: string }>(res);
}

export async function apiSubmitGuestRsvp(
  token: string,
  payload: { name: string; email: string; status: AttendeeRsvpStatus },
): Promise<CalendarEventRecord> {
  const res = await fetch(`/api/share/${encodeURIComponent(token)}/rsvp`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{ event: CalendarEventRecord }>(res);
  return data.event;
}

export async function apiFetchWebhooks(): Promise<WebhookSubscription[]> {
  const res = await fetch('/api/webhooks', { headers: DEFAULT_HEADERS });
  const data = await parseJson<{ webhooks: WebhookSubscription[] }>(res);
  return data.webhooks;
}

export async function apiCreateWebhook(payload: {
  name: string;
  url: string;
  events: WebhookTriggerType[];
}): Promise<WebhookSubscription> {
  const res = await fetch('/api/webhooks', {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{ webhook: WebhookSubscription }>(res);
  return data.webhook;
}

export async function apiToggleWebhook(
  id: string,
  active: boolean,
): Promise<WebhookSubscription> {
  const res = await fetch(`/api/webhooks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ active }),
  });
  const data = await parseJson<{ webhook: WebhookSubscription }>(res);
  return data.webhook;
}

export async function apiDeleteWebhook(id: string): Promise<void> {
  const res = await fetch(`/api/webhooks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: DEFAULT_HEADERS,
  });
  await parseJson<{ deleted: boolean }>(res);
}

export async function apiTestWebhook(id: string): Promise<DeliveryLogEntry> {
  const res = await fetch(`/api/webhooks/${encodeURIComponent(id)}/test`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
  });
  const data = await parseJson<{ delivery: DeliveryLogEntry }>(res);
  return data.delivery;
}

export async function apiFetchEmailAutomation(): Promise<{
  config: EmailAutomationConfig;
  providerConfigured: boolean;
}> {
  const res = await fetch('/api/email-automation', { headers: DEFAULT_HEADERS });
  return parseJson<{
    config: EmailAutomationConfig;
    providerConfigured: boolean;
  }>(res);
}

export async function apiUpdateEmailAutomation(
  patch: Partial<EmailAutomationConfig>,
): Promise<EmailAutomationConfig> {
  const res = await fetch('/api/email-automation', {
    method: 'PUT',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(patch),
  });
  const data = await parseJson<{ config: EmailAutomationConfig }>(res);
  return data.config;
}

export async function apiDispatchNotifications(payload?: {
  eventId?: string;
  windowMinutes?: number;
}): Promise<{ dispatchedCount: number; eventIds: string[] }> {
  const res = await fetch('/api/notifications/dispatch', {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(payload || { windowMinutes: 120 }),
  });
  return parseJson<{ dispatchedCount: number; eventIds: string[] }>(res);
}

export async function apiFetchDeliveries(): Promise<DeliveryLogEntry[]> {
  const res = await fetch('/api/deliveries', { headers: DEFAULT_HEADERS });
  const data = await parseJson<{ deliveries: DeliveryLogEntry[] }>(res);
  return data.deliveries;
}
