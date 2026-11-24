import 'dotenv/config';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createSeedEvents, DEFAULT_EMAIL_AUTOMATION } from './src/data/seedEvents';
import type {
  AttendeeRsvpStatus,
  CalendarCategoryId,
  CalendarEventRecord,
  DeliveryLogEntry,
  EmailAutomationConfig,
  EventAttachment,
  EventAttendee,
  EventReminder,
  WebhookSubscription,
  WebhookTriggerType,
} from './src/types/calendar';
import { buildIcsContent, isSafeExternalUrl } from './src/utils/icsExport';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Ephemeral HMAC fallback if WEBHOOK_SIGNING_SECRET is not yet set in env
const SIGNING_SECRET =
  process.env.WEBHOOK_SIGNING_SECRET?.trim() ||
  crypto.randomBytes(32).toString('hex');

const VALID_CATEGORIES = new Set<CalendarCategoryId>([
  'product',
  'meetings',
  'operations',
  'milestones',
]);

const VALID_TRIGGERS = new Set<WebhookTriggerType>([
  'event.created',
  'event.updated',
  'event.deleted',
  'event.rsvp',
  'event.reminder',
  'email.dispatch',
]);

const VALID_RSVP = new Set<AttendeeRsvpStatus>([
  'needsAction',
  'accepted',
  'tentative',
  'declined',
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface PersistedState {
  events: CalendarEventRecord[];
  webhooks: WebhookSubscription[];
  emailAutomation: EmailAutomationConfig;
  deliveries: DeliveryLogEntry[];
}

// Strict data confinement inside project directory
const DATA_DIR = path.resolve(__dirname, '.data');
const DATA_FILE = path.resolve(DATA_DIR, 'calendar-store.json');

let state: PersistedState = {
  events: createSeedEvents(),
  webhooks: [],
  emailAutomation: { ...DEFAULT_EMAIL_AUTOMATION },
  deliveries: [],
};

// Serialized mutation queue for concurrency safety
let writeChain: Promise<unknown> = Promise.resolve();
function withStoreLock<T>(task: () => Promise<T> | T): Promise<T> {
  const next = writeChain.then(task, task);
  writeChain = next.catch(() => undefined);
  return next;
}

async function loadStoreFromDisk(): Promise<void> {
  try {
    if (!DATA_FILE.startsWith(DATA_DIR + path.sep)) return;
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (Array.isArray(parsed.events) && parsed.events.length > 0) {
      state.events = parsed.events;
    }
    if (Array.isArray(parsed.webhooks)) {
      state.webhooks = parsed.webhooks;
    }
    if (parsed.emailAutomation) {
      state.emailAutomation = {
        ...DEFAULT_EMAIL_AUTOMATION,
        ...parsed.emailAutomation,
      };
    }
    if (Array.isArray(parsed.deliveries)) {
      state.deliveries = parsed.deliveries.slice(0, 100);
    }
  } catch {
    // First boot or unavailable filesystem — keep seeded state in memory
  }
}

async function saveStoreToDisk(): Promise<void> {
  try {
    if (!DATA_FILE.startsWith(DATA_DIR + path.sep)) return;
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tempFile = path.resolve(DATA_DIR, `calendar-store.${process.pid}.tmp`);
    if (!tempFile.startsWith(DATA_DIR + path.sep)) return;
    await fs.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tempFile, DATA_FILE);
  } catch {
    // Graceful in-memory fallback if storage is read-only
  }
}

// Real-time Server-Sent Events clients for multi-client enterprise concurrency
const sseClients = new Set<Response>();

function broadcastSse(type: string, payload: unknown): void {
  const frame = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(frame);
    } catch {
      sseClients.delete(res);
    }
  }
}

// Simple per-IP sliding window rate limiter for mutating / webhook routes
const rateBucket = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const entry = rateBucket.get(key);
    if (!entry || entry.resetAt <= now) {
      rateBucket.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (entry.count >= maxRequests) {
      res.status(429).json({
        error: 'Rate limit exceeded. Please retry shortly.',
      });
      return;
    }
    entry.count += 1;
    next();
  };
}

// Optional API key check for external callers when CALENDAR_API_KEY is configured
function checkApiAuth(req: Request, res: Response, next: NextFunction): void {
  const configuredKey = process.env.CALENDAR_API_KEY?.trim();
  if (!configuredKey) {
    next();
    return;
  }

  // Allow same-origin UI calls from the hosted dashboard
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = req.headers.origin;
  const requestedWith = req.headers['x-requested-with'];
  if (requestedWith === 'FullCalendarStudio' && origin && host) {
    try {
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.host === String(host)) {
        next();
        return;
      }
    } catch {
      // Fall through to key check
    }
  }

  const headerKey =
    (req.headers['x-api-key'] as string | undefined) ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : '');

  if (
    headerKey.length === configuredKey.length &&
    crypto.timingSafeEqual(Buffer.from(headerKey), Buffer.from(configuredKey))
  ) {
    next();
    return;
  }

  res.status(401).json({
    error: 'Unauthorized. Provide a valid X-API-Key or Authorization Bearer token.',
  });
}

// SSRF protection: block loopback, private, link-local, metadata, and non-HTTPS targets
function isPrivateIpAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return true;
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('::ffff:127.') ||
      lower.startsWith('::ffff:10.') ||
      lower.startsWith('::ffff:192.168.') ||
      lower.startsWith('::ffff:169.254.')
    ) {
      return true;
    }
    return false;
  }
  return true;
}

async function validateOutboundWebhookUrl(
  rawUrl: string,
): Promise<{ valid: boolean; reason?: string; normalized?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, reason: 'Invalid URL format.' };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      reason: 'Webhook endpoints must use HTTPS for security.',
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal'
  ) {
    return {
      valid: false,
      reason: 'Private or local network hostnames are not permitted.',
    };
  }

  if (net.isIP(hostname) && isPrivateIpAddress(hostname)) {
    return {
      valid: false,
      reason: 'Private or loopback IP addresses are not permitted.',
    };
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records.length) {
      return { valid: false, reason: 'Webhook hostname could not be resolved.' };
    }
    for (const rec of records) {
      if (isPrivateIpAddress(rec.address)) {
        return {
          valid: false,
          reason: 'Webhook destination resolves to a private or restricted IP.',
        };
      }
    }
  } catch {
    return { valid: false, reason: 'Could not resolve webhook hostname.' };
  }

  return { valid: true, normalized: parsed.toString() };
}

function recordDelivery(entry: Omit<DeliveryLogEntry, 'id' | 'timestamp'>): DeliveryLogEntry {
  const full: DeliveryLogEntry = {
    id: `dlv-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  state.deliveries = [full, ...state.deliveries].slice(0, 80);
  broadcastSse('delivery.logged', full);
  return full;
}

function signPayload(body: string): string {
  return `sha256=${crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(body)
    .digest('hex')}`;
}

async function deliverWebhookRequest(
  targetUrl: string,
  trigger: WebhookTriggerType,
  eventTitle: string,
  payload: Record<string, unknown>,
  channel: 'webhook' | 'email' = 'webhook',
): Promise<DeliveryLogEntry> {
  const validation = await validateOutboundWebhookUrl(targetUrl);
  if (!validation.valid || !validation.normalized) {
    return recordDelivery({
      trigger,
      channel,
      target: targetUrl,
      eventTitle,
      status: 'failed',
      detail: validation.reason || 'Blocked outbound URL.',
    });
  }

  const body = JSON.stringify({
    id: `msg_${crypto.randomBytes(8).toString('hex')}`,
    type: trigger,
    occurredAt: new Date().toISOString(),
    data: payload,
  });

  try {
    const response = await fetch(validation.normalized, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FullCalendar-Studio-Webhook/1.0',
        'X-Calendar-Event': trigger,
        'X-Calendar-Signature': signPayload(body),
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });

    const ok = response.status >= 200 && response.status < 300;
    return recordDelivery({
      trigger,
      channel,
      target: validation.normalized,
      eventTitle,
      status: ok ? 'delivered' : 'failed',
      httpStatus: response.status,
      detail: ok
        ? `Delivered signed payload (HTTP ${response.status})`
        : `Endpoint returned HTTP ${response.status}`,
    });
  } catch (err) {
    return recordDelivery({
      trigger,
      channel,
      target: validation.normalized,
      eventTitle,
      status: 'failed',
      detail:
        err instanceof Error
          ? `Request failed: ${err.message}`
          : 'Webhook dispatch timed out or failed.',
    });
  }
}

async function dispatchEmailAutomation(
  trigger: WebhookTriggerType,
  event: CalendarEventRecord,
  recipients: string[],
  subject: string,
  summaryText: string,
  shareUrl: string,
): Promise<void> {
  const emailCfg = state.emailAutomation;
  if (!emailCfg.enabled || recipients.length === 0) return;

  const emailJob = {
    trigger,
    fromName: emailCfg.senderName,
    replyTo: emailCfg.replyToEmail,
    to: recipients,
    subject,
    text: `${summaryText}\n\nEvent: ${event.title}\nStart: ${event.start}${
      event.location ? `\nLocation: ${event.location}` : ''
    }${event.meetingUrl ? `\nJoin Link: ${event.meetingUrl}` : ''}\nView & RSVP: ${shareUrl}`,
    event,
    shareUrl,
  };

  let sentExternally = false;

  // 1. Direct Resend transactional email API when configured in server env
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress =
    process.env.EMAIL_FROM_ADDRESS?.trim() || 'calendar@yourdomain.com';
  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${emailCfg.senderName} <${fromAddress}>`,
          to: recipients,
          reply_to: emailCfg.replyToEmail,
          subject,
          text: emailJob.text,
        }),
        signal: AbortSignal.timeout(5000),
      });
      sentExternally = true;
      recordDelivery({
        trigger: 'email.dispatch',
        channel: 'email',
        target: recipients.join(', '),
        eventTitle: event.title,
        status: res.ok ? 'delivered' : 'failed',
        httpStatus: res.status,
        detail: res.ok
          ? `Sent via Resend to ${recipients.length} recipient(s)`
          : `Resend API returned HTTP ${res.status}`,
      });
    } catch (err) {
      recordDelivery({
        trigger: 'email.dispatch',
        channel: 'email',
        target: recipients.join(', '),
        eventTitle: event.title,
        status: 'failed',
        detail:
          err instanceof Error ? err.message : 'Resend delivery error',
      });
    }
  }

  // 2. Env-configured email automation webhook (n8n / Zapier / Make / custom worker)
  const envEmailWebhook = process.env.EMAIL_AUTOMATION_WEBHOOK_URL?.trim();
  if (envEmailWebhook) {
    sentExternally = true;
    await deliverWebhookRequest(
      envEmailWebhook,
      'email.dispatch',
      event.title,
      emailJob,
      'email',
    );
  }

  // 3. Any user-registered webhook listening to `email.dispatch`
  const emailHooks = state.webhooks.filter(
    (hook) => hook.active && hook.events.includes('email.dispatch'),
  );
  for (const hook of emailHooks) {
    sentExternally = true;
    await deliverWebhookRequest(
      hook.url,
      'email.dispatch',
      event.title,
      emailJob,
      'email',
    );
  }

  // 4. Record structured queued payload when no external mailer is connected yet
  if (!sentExternally) {
    recordDelivery({
      trigger: 'email.dispatch',
      channel: 'email',
      target: recipients.join(', '),
      eventTitle: event.title,
      status: 'queued',
      detail: `Email payload ready (${recipients.length} recipient${
        recipients.length === 1 ? '' : 's'
      }). Attach an n8n/Zapier webhook or RESEND_API_KEY to deliver live.`,
    });
  }
}

async function triggerAutomationPipeline(
  trigger: WebhookTriggerType,
  event: CalendarEventRecord,
  baseUrl: string,
  extra?: Record<string, unknown>,
  skipEmail = false,
): Promise<void> {
  const shareUrl = `${baseUrl}/?share=${encodeURIComponent(event.shareToken)}`;
  const matchingHooks = state.webhooks.filter(
    (hook) => hook.active && hook.events.includes(trigger),
  );

  await Promise.all(
    matchingHooks.map((hook) =>
      deliverWebhookRequest(hook.url, trigger, event.title, {
        event,
        shareUrl,
        ...extra,
      }),
    ),
  );

  if (skipEmail) return;

  const recipients = Array.from(
    new Set(
      (event.attendees || [])
        .map((a) => a.email.trim())
        .filter((email) => EMAIL_PATTERN.test(email)),
    ),
  );
  if (recipients.length === 0) return;

  const cfg = state.emailAutomation;
  if (trigger === 'event.created' && cfg.sendOnCreate) {
    await dispatchEmailAutomation(
      trigger,
      event,
      recipients,
      `Invitation: ${event.title}`,
      'You have been invited to a calendar event.',
      shareUrl,
    );
  } else if (trigger === 'event.updated' && cfg.sendOnUpdate) {
    await dispatchEmailAutomation(
      trigger,
      event,
      recipients,
      `Updated: ${event.title}`,
      'An event you are invited to has been updated.',
      shareUrl,
    );
  } else if (trigger === 'event.deleted' && cfg.sendOnCancel) {
    await dispatchEmailAutomation(
      trigger,
      event,
      recipients,
      `Cancelled: ${event.title}`,
      'This event has been cancelled.',
      shareUrl,
    );
  } else if (trigger === 'event.rsvp' && cfg.sendOnRsvp) {
    const rsvpActor = String(extra?.attendeeEmail || 'A guest');
    const rsvpStatus = String(extra?.status || 'updated');
    await dispatchEmailAutomation(
      trigger,
      event,
      recipients,
      `RSVP (${rsvpStatus}): ${event.title}`,
      `${rsvpActor} responded "${rsvpStatus}" to this event.`,
      shareUrl,
    );
  } else if (trigger === 'event.reminder' && cfg.sendReminders) {
    await dispatchEmailAutomation(
      trigger,
      event,
      recipients,
      `Reminder: ${event.title}`,
      'Upcoming event reminder.',
      shareUrl,
    );
  }
}

function getBaseUrl(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL') {
    return configured.replace(/\/$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function sanitizeAttendees(raw: unknown): EventAttendee[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: EventAttendee[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, 50)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const email = String(obj.email || '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || seen.has(email)) continue;
    seen.add(email);
    const status = VALID_RSVP.has(obj.status as AttendeeRsvpStatus)
      ? (obj.status as AttendeeRsvpStatus)
      : 'needsAction';
    cleaned.push({
      email,
      name: obj.name ? String(obj.name).trim().slice(0, 80) : undefined,
      status,
      respondedAt: obj.respondedAt ? String(obj.respondedAt) : undefined,
    });
  }
  return cleaned;
}

function sanitizeReminders(raw: unknown): EventReminder[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: EventReminder[] = [];
  for (const item of raw.slice(0, 10)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const minutes = Math.max(0, Math.min(43200, Math.round(Number(obj.minutesBefore || 10))));
    const channel =
      obj.channel === 'email' || obj.channel === 'webhook' ? obj.channel : 'browser';
    cleaned.push({
      id: String(obj.id || `rem-${crypto.randomBytes(3).toString('hex')}`).slice(0, 40),
      minutesBefore: minutes,
      channel,
    });
  }
  return cleaned;
}

function sanitizeAttachments(raw: unknown): EventAttachment[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: EventAttachment[] = [];
  for (const item of raw.slice(0, 10)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const url = String(obj.url || '').trim();
    if (!isSafeExternalUrl(url)) continue;
    cleaned.push({
      id: String(obj.id || `att-${crypto.randomBytes(3).toString('hex')}`).slice(0, 40),
      label: String(obj.label || url).trim().slice(0, 100),
      url: url.slice(0, 500),
    });
  }
  return cleaned;
}

function sanitizeNewEvent(input: Record<string, unknown>): CalendarEventRecord | null {
  const title = String(input.title || '').trim().slice(0, 160);
  const start = String(input.start || '').trim().slice(0, 40);
  if (!title || !start) return null;

  const categoryId = VALID_CATEGORIES.has(input.categoryId as CalendarCategoryId)
    ? (input.categoryId as CalendarCategoryId)
    : 'product';

  const meetingUrlRaw = String(input.meetingUrl || '').trim();
  const meetingUrl =
    meetingUrlRaw && isSafeExternalUrl(meetingUrlRaw)
      ? meetingUrlRaw.slice(0, 500)
      : undefined;

  return {
    id:
      typeof input.id === 'string' && input.id.trim()
        ? input.id.trim().slice(0, 64)
        : `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    shareToken:
      typeof input.shareToken === 'string' && input.shareToken.trim()
        ? input.shareToken.trim().slice(0, 64)
        : crypto.randomBytes(8).toString('base64url'),
    version: 1,
    updatedAt: new Date().toISOString(),
    title,
    start,
    end: input.end ? String(input.end).trim().slice(0, 40) : undefined,
    allDay: Boolean(input.allDay),
    timezone: String(input.timezone || 'UTC').trim().slice(0, 64),
    categoryId,
    location: input.location ? String(input.location).trim().slice(0, 180) : undefined,
    meetingUrl,
    notes: input.notes ? String(input.notes).trim().slice(0, 4000) : undefined,
    organizerEmail: input.organizerEmail
      ? String(input.organizerEmail).trim().slice(0, 120)
      : undefined,
    attendees: sanitizeAttendees(input.attendees),
    reminders: sanitizeReminders(input.reminders),
    attachments: sanitizeAttachments(input.attachments),
    visibility: input.visibility === 'private' ? 'private' : 'public',
    availability: input.availability === 'free' ? 'free' : 'busy',
    groupId: input.groupId ? String(input.groupId).trim().slice(0, 64) : undefined,
  };
}

async function startServer(): Promise<void> {
  await loadStoreFromDisk();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));

  // ── Public Health Check ──
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      concurrency: {
        connectedClients: sseClients.size,
        optimisticLocking: true,
      },
      counts: {
        events: state.events.length,
        webhooks: state.webhooks.length,
        deliveries: state.deliveries.length,
      },
      emailProviderConfigured: Boolean(
        process.env.RESEND_API_KEY?.trim() ||
          process.env.EMAIL_AUTOMATION_WEBHOOK_URL?.trim(),
      ),
    });
  });

  // ── Live Server-Sent Events Stream for Multi-Client Concurrency ──
  app.get('/api/stream', checkApiAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    sseClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // ── Public Shareable Event Link Lookup ──
  app.get('/api/share/:token', (req, res) => {
    const token = String(req.params.token || '').trim();
    const event = state.events.find((e) => e.shareToken === token || e.id === token);
    if (!event) {
      res.status(404).json({ error: 'Shared event link not found or expired.' });
      return;
    }
    res.json({
      event:
        event.visibility === 'private'
          ? {
              ...event,
              notes: 'Private event — contact the organizer for full notes.',
              attachments: [],
            }
          : event,
      icsUrl: `${getBaseUrl(req)}/api/ics/feed.ics?token=${encodeURIComponent(event.shareToken)}`,
    });
  });

  // ── Public Guest RSVP Endpoint on Shared Link ──
  app.post('/api/share/:token/rsvp', rateLimit(40, 60_000), async (req, res) => {
    const token = String(req.params.token || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const status = req.body?.status as AttendeeRsvpStatus;

    if (!EMAIL_PATTERN.test(email)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    if (!VALID_RSVP.has(status) || status === 'needsAction') {
      res.status(400).json({ error: 'Invalid RSVP status.' });
      return;
    }

    const updatedEvent = await withStoreLock(async () => {
      const idx = state.events.findIndex(
        (e) => e.shareToken === token || e.id === token,
      );
      if (idx === -1) return null;

      const current = state.events[idx];
      const existingIdx = current.attendees.findIndex(
        (a) => a.email.toLowerCase() === email,
      );
      const nextAttendees = [...current.attendees];
      const nowIso = new Date().toISOString();

      if (existingIdx >= 0) {
        nextAttendees[existingIdx] = {
          ...nextAttendees[existingIdx],
          name: name || nextAttendees[existingIdx].name,
          status,
          respondedAt: nowIso,
        };
      } else {
        nextAttendees.push({
          email,
          name: name || undefined,
          status,
          respondedAt: nowIso,
        });
      }

      const nextEvent: CalendarEventRecord = {
        ...current,
        attendees: nextAttendees,
        version: current.version + 1,
        updatedAt: nowIso,
      };
      state.events[idx] = nextEvent;
      await saveStoreToDisk();
      return nextEvent;
    });

    if (!updatedEvent) {
      res.status(404).json({ error: 'Shared event not found.' });
      return;
    }

    broadcastSse('event.updated', updatedEvent);
    void triggerAutomationPipeline('event.rsvp', updatedEvent, getBaseUrl(req), {
      attendeeEmail: email,
      attendeeName: name,
      status,
    });

    res.json({ event: updatedEvent });
  });

  // ── Live Subscribable iCalendar (.ics) Feed ──
  app.get('/api/ics/feed.ics', (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const category =
      typeof req.query.category === 'string' ? req.query.category.trim() : '';

    let subset = state.events;
    if (token) {
      subset = subset.filter((e) => e.shareToken === token || e.id === token);
    } else if (category && VALID_CATEGORIES.has(category as CalendarCategoryId)) {
      subset = subset.filter((e) => e.categoryId === category);
    }

    const ics = buildIcsContent(subset);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${token ? 'event' : 'enterprise-calendar'}.ics"`,
    );
    res.send(ics);
  });

  // ── REST API: Events CRUD with Optimistic Concurrency ──
  app.get('/api/events', checkApiAuth, (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
    const category =
      typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const search =
      typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    let items = state.events;
    if (from) items = items.filter((e) => e.start >= from);
    if (to) items = items.filter((e) => e.start <= to);
    if (category && VALID_CATEGORIES.has(category as CalendarCategoryId)) {
      items = items.filter((e) => e.categoryId === category);
    }
    if (search) {
      items = items.filter(
        (e) =>
          e.title.toLowerCase().includes(search) ||
          (e.location && e.location.toLowerCase().includes(search)) ||
          (e.notes && e.notes.toLowerCase().includes(search)),
      );
    }

    res.json({ events: items, total: items.length });
  });

  app.post('/api/events', checkApiAuth, rateLimit(120, 60_000), async (req, res) => {
    const rawItems = Array.isArray(req.body?.events)
      ? (req.body.events as Record<string, unknown>[])
      : [req.body as Record<string, unknown>];

    if (rawItems.length === 0 || rawItems.length > 52) {
      res.status(400).json({ error: 'Provide between 1 and 52 events per request.' });
      return;
    }

    const notifyAttendees = req.body?.notifyAttendees !== false;
    const sanitized: CalendarEventRecord[] = [];
    for (const item of rawItems) {
      const clean = sanitizeNewEvent(item);
      if (!clean) {
        res.status(400).json({ error: 'Each event requires a valid title and start date.' });
        return;
      }
      sanitized.push(clean);
    }

    await withStoreLock(async () => {
      state.events = [...state.events, ...sanitized];
      await saveStoreToDisk();
    });

    const baseUrl = getBaseUrl(req);
    for (const created of sanitized) {
      broadcastSse('event.created', created);
    }
    // Trigger automation for primary event (avoid spamming N emails for recurring batch)
    if (sanitized[0]) {
      void triggerAutomationPipeline(
        'event.created',
        sanitized[0],
        baseUrl,
        { batchCount: sanitized.length },
        !notifyAttendees,
      );
    }

    res.status(201).json({
      event: sanitized[0],
      events: sanitized,
    });
  });

  app.patch('/api/events/:id', checkApiAuth, rateLimit(180, 60_000), async (req, res) => {
    const id = String(req.params.id || '').trim();
    const expectedVersionRaw = req.body?.expectedVersion ?? req.headers['if-match'];
    const expectedVersion =
      expectedVersionRaw !== undefined && expectedVersionRaw !== ''
        ? Number(String(expectedVersionRaw).replace(/"/g, ''))
        : undefined;
    const notifyAttendees = req.body?.notifyAttendees !== false;

    const result = await withStoreLock(async () => {
      const idx = state.events.findIndex((e) => e.id === id);
      if (idx === -1) return { status: 404 as const };

      const current = state.events[idx];
      if (
        expectedVersion !== undefined &&
        !Number.isNaN(expectedVersion) &&
        current.version !== expectedVersion
      ) {
        return { status: 409 as const, latest: current };
      }

      const patch = req.body as Record<string, unknown>;
      const nextMeetingUrl =
        patch.meetingUrl !== undefined
          ? String(patch.meetingUrl || '').trim()
          : current.meetingUrl || '';

      const updated: CalendarEventRecord = {
        ...current,
        title:
          patch.title !== undefined
            ? String(patch.title).trim().slice(0, 160) || current.title
            : current.title,
        start:
          patch.start !== undefined
            ? String(patch.start).trim().slice(0, 40) || current.start
            : current.start,
        end:
          patch.end !== undefined
            ? patch.end
              ? String(patch.end).trim().slice(0, 40)
              : undefined
            : current.end,
        allDay: patch.allDay !== undefined ? Boolean(patch.allDay) : current.allDay,
        timezone:
          patch.timezone !== undefined
            ? String(patch.timezone).trim().slice(0, 64)
            : current.timezone,
        categoryId:
          patch.categoryId !== undefined &&
          VALID_CATEGORIES.has(patch.categoryId as CalendarCategoryId)
            ? (patch.categoryId as CalendarCategoryId)
            : current.categoryId,
        location:
          patch.location !== undefined
            ? String(patch.location || '').trim().slice(0, 180) || undefined
            : current.location,
        meetingUrl:
          nextMeetingUrl && isSafeExternalUrl(nextMeetingUrl)
            ? nextMeetingUrl.slice(0, 500)
            : undefined,
        notes:
          patch.notes !== undefined
            ? String(patch.notes || '').trim().slice(0, 4000) || undefined
            : current.notes,
        attendees:
          patch.attendees !== undefined
            ? sanitizeAttendees(patch.attendees)
            : current.attendees,
        reminders:
          patch.reminders !== undefined
            ? sanitizeReminders(patch.reminders)
            : current.reminders,
        attachments:
          patch.attachments !== undefined
            ? sanitizeAttachments(patch.attachments)
            : current.attachments,
        visibility:
          patch.visibility === 'private'
            ? 'private'
            : patch.visibility === 'public'
              ? 'public'
              : current.visibility,
        availability:
          patch.availability === 'free'
            ? 'free'
            : patch.availability === 'busy'
              ? 'busy'
              : current.availability,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };

      state.events[idx] = updated;
      await saveStoreToDisk();
      return { status: 200 as const, event: updated };
    });

    if (result.status === 404) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }
    if (result.status === 409) {
      res.status(409).json({
        error: 'Event was modified concurrently by another session.',
        latest: result.latest,
      });
      return;
    }

    res.setHeader('ETag', `"${result.event.version}"`);
    broadcastSse('event.updated', result.event);
    void triggerAutomationPipeline(
      'event.updated',
      result.event,
      getBaseUrl(req),
      undefined,
      !notifyAttendees,
    );
    res.json({ event: result.event });
  });

  app.delete('/api/events/:id', checkApiAuth, rateLimit(120, 60_000), async (req, res) => {
    const id = String(req.params.id || '').trim();
    const removed = await withStoreLock(async () => {
      const idx = state.events.findIndex((e) => e.id === id);
      if (idx === -1) return null;
      const [deleted] = state.events.splice(idx, 1);
      await saveStoreToDisk();
      return deleted;
    });

    if (!removed) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    broadcastSse('event.deleted', { id: removed.id });
    void triggerAutomationPipeline('event.deleted', removed, getBaseUrl(req));
    res.json({ deleted: true, id: removed.id });
  });

  app.post('/api/events/reset', checkApiAuth, rateLimit(15, 60_000), async (_req, res) => {
    const fresh = createSeedEvents();
    await withStoreLock(async () => {
      state.events = fresh;
      await saveStoreToDisk();
    });
    broadcastSse('events.reset', fresh);
    res.json({ events: fresh });
  });

  // ── Workflow Webhooks API ──
  app.get('/api/webhooks', checkApiAuth, (_req, res) => {
    res.json({ webhooks: state.webhooks });
  });

  app.post('/api/webhooks', checkApiAuth, rateLimit(30, 60_000), async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const url = String(req.body?.url || '').trim();
    const rawEvents = Array.isArray(req.body?.events) ? req.body.events : [];
    const events = rawEvents.filter((e: unknown): e is WebhookTriggerType =>
      VALID_TRIGGERS.has(e as WebhookTriggerType),
    );

    if (!name) {
      res.status(400).json({ error: 'Webhook name is required.' });
      return;
    }
    if (events.length === 0) {
      res.status(400).json({ error: 'Select at least one trigger event.' });
      return;
    }

    const validation = await validateOutboundWebhookUrl(url);
    if (!validation.valid || !validation.normalized) {
      res.status(400).json({ error: validation.reason || 'Invalid webhook URL.' });
      return;
    }

    const created: WebhookSubscription = {
      id: `whk-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      name,
      url: validation.normalized,
      events,
      active: true,
      createdAt: new Date().toISOString(),
    };

    await withStoreLock(async () => {
      state.webhooks = [created, ...state.webhooks].slice(0, 30);
      await saveStoreToDisk();
    });

    res.status(201).json({ webhook: created });
  });

  app.patch('/api/webhooks/:id', checkApiAuth, async (req, res) => {
    const id = String(req.params.id || '').trim();
    const updated = await withStoreLock(async () => {
      const idx = state.webhooks.findIndex((w) => w.id === id);
      if (idx === -1) return null;
      const cur = state.webhooks[idx];
      const next: WebhookSubscription = {
        ...cur,
        active: req.body?.active !== undefined ? Boolean(req.body.active) : cur.active,
      };
      state.webhooks[idx] = next;
      await saveStoreToDisk();
      return next;
    });

    if (!updated) {
      res.status(404).json({ error: 'Webhook not found.' });
      return;
    }
    res.json({ webhook: updated });
  });

  app.delete('/api/webhooks/:id', checkApiAuth, async (req, res) => {
    const id = String(req.params.id || '').trim();
    const found = await withStoreLock(async () => {
      const before = state.webhooks.length;
      state.webhooks = state.webhooks.filter((w) => w.id !== id);
      if (state.webhooks.length === before) return false;
      await saveStoreToDisk();
      return true;
    });
    if (!found) {
      res.status(404).json({ error: 'Webhook not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  app.post('/api/webhooks/:id/test', checkApiAuth, rateLimit(20, 60_000), async (req, res) => {
    const id = String(req.params.id || '').trim();
    const hook = state.webhooks.find((w) => w.id === id);
    if (!hook) {
      res.status(404).json({ error: 'Webhook not found.' });
      return;
    }

    const sampleEvent = state.events[0] || createSeedEvents()[0];
    const delivery = await deliverWebhookRequest(
      hook.url,
      hook.events[0] || 'event.created',
      `Test: ${sampleEvent.title}`,
      {
        test: true,
        event: sampleEvent,
        shareUrl: `${getBaseUrl(req)}/?share=${encodeURIComponent(sampleEvent.shareToken)}`,
      },
    );
    await withStoreLock(() => saveStoreToDisk());
    res.json({ delivery });
  });

  // ── Email Automation Rules & Cron Notification Dispatch Endpoint ──
  app.get('/api/email-automation', checkApiAuth, (_req, res) => {
    res.json({
      config: state.emailAutomation,
      providerConfigured: Boolean(
        process.env.RESEND_API_KEY?.trim() ||
          process.env.EMAIL_AUTOMATION_WEBHOOK_URL?.trim(),
      ),
    });
  });

  app.put('/api/email-automation', checkApiAuth, async (req, res) => {
    const body = req.body as Partial<EmailAutomationConfig>;
    const updated = await withStoreLock(async () => {
      state.emailAutomation = {
        enabled: body.enabled !== undefined ? Boolean(body.enabled) : state.emailAutomation.enabled,
        senderName: body.senderName
          ? String(body.senderName).trim().slice(0, 80)
          : state.emailAutomation.senderName,
        replyToEmail:
          body.replyToEmail && EMAIL_PATTERN.test(String(body.replyToEmail).trim())
            ? String(body.replyToEmail).trim()
            : state.emailAutomation.replyToEmail,
        sendOnCreate:
          body.sendOnCreate !== undefined
            ? Boolean(body.sendOnCreate)
            : state.emailAutomation.sendOnCreate,
        sendOnUpdate:
          body.sendOnUpdate !== undefined
            ? Boolean(body.sendOnUpdate)
            : state.emailAutomation.sendOnUpdate,
        sendOnCancel:
          body.sendOnCancel !== undefined
            ? Boolean(body.sendOnCancel)
            : state.emailAutomation.sendOnCancel,
        sendOnRsvp:
          body.sendOnRsvp !== undefined
            ? Boolean(body.sendOnRsvp)
            : state.emailAutomation.sendOnRsvp,
        sendReminders:
          body.sendReminders !== undefined
            ? Boolean(body.sendReminders)
            : state.emailAutomation.sendReminders,
      };
      await saveStoreToDisk();
      return state.emailAutomation;
    });

    res.json({ config: updated });
  });

  // Cron-ready endpoint: notify attendees for upcoming events or a specific eventId
  app.post(
    '/api/notifications/dispatch',
    checkApiAuth,
    rateLimit(30, 60_000),
    async (req, res) => {
      const eventId = typeof req.body?.eventId === 'string' ? req.body.eventId.trim() : '';
      const windowMinutes = Math.max(
        5,
        Math.min(10080, Number(req.body?.windowMinutes || 60)),
      );
      const baseUrl = getBaseUrl(req);
      const nowMs = Date.now();

      const targets = eventId
        ? state.events.filter((e) => e.id === eventId)
        : state.events.filter((e) => {
            const startMs = new Date(e.start).getTime();
            return (
              !Number.isNaN(startMs) &&
              startMs >= nowMs &&
              startMs <= nowMs + windowMinutes * 60_000
            );
          });

      for (const evt of targets) {
        await triggerAutomationPipeline('event.reminder', evt, baseUrl, {
          dispatchedBy: eventId ? 'manual' : 'scheduled-window',
        });
      }

      await withStoreLock(() => saveStoreToDisk());
      res.json({
        dispatchedCount: targets.length,
        eventIds: targets.map((e) => e.id),
      });
    },
  );

  app.get('/api/deliveries', checkApiAuth, (_req, res) => {
    res.json({ deliveries: state.deliveries });
  });

  // ── Frontend Serving (Vite dev middleware in dev, dist/ in production) ──
  if (IS_PROD) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FullCalendar Enterprise server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
