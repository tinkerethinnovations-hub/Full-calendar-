# FullCalendar Studio — Enterprise Scheduling & Automation Platform

A full-stack, Google Calendar–class scheduling application built on **FullCalendar v7.1.5**, **React 19**, **Tailwind CSS v4**, and **Express**, designed for embedding into enterprise dashboards and connecting directly to workflow automation engines (n8n, Zapier, Make, Resend, AWS SES, or custom microservices) without requiring Google OAuth app verification.

---

## 1. High-Level Architecture & Connections

```text
+-------------------------------------------------------------------------+
|                   HOST ENTERPRISE WEBSITE / DASHBOARD                   |
|  - Mounts calendar via <iframe src="/?embed=1&view=timeGridWeek">       |
|  - Listens to window.addEventListener('message') for UI selection/sync  |
|  - Calls REST API (/api/events) with X-API-Key / Bearer auth            |
+---------------------------+---------------------------------------------+
                            | HTTPS (iframe + REST + SSE)
                            v
+-------------------------------------------------------------------------+
|                    FRONTEND (React 19 + FullCalendar v7)                |
|  - Views: Month, Week, Day, List, Multi-Month Year                      |
|  - External Draggable Backlog, Mini-Calendar, 5 Official v7 Themes      |
|  - Standalone Guest RSVP View (/?share=<shareToken>)                    |
|  - Live EventSource('/api/stream') for instant multi-client updates     |
|  - Browser Notification API + In-App Reminder Inbox                     |
+---------------------------+---------------------------------------------+
                            | JSON / SSE / ICS
                            v
+-------------------------------------------------------------------------+
|                    BACKEND API & REALTIME SERVER (server.ts)            |
|  - REST CRUD (/api/events) with Optimistic Locking (version / ETag)     |
|  - Public Share & Guest RSVP (/api/share/:token, /rsvp)                 |
|  - Live iCalendar Subscription Feed (/api/ics/feed.ics)                 |
|  - SSE Broadcast Hub (/api/stream)                                      |
|  - Cron Reminder Trigger (/api/notifications/dispatch)                  |
|  - SSRF-Hardened Outbound Webhook Dispatcher (HMAC-SHA256 signed)       |
+-------------+-----------------------------------------+-----------------+
              |                                         |
              v                                         v
+-------------------------------+       +---------------------------------+
| STORAGE LAYER                 |       | AUTOMATION & EMAIL PIPELINE     |
| Current (Dev/Preview):        |       | - Outbound Webhooks (n8n, Make, |
|  - Atomic JSON store (.data/) |       |   Zapier, Slack, custom worker) |
|  - In-process mutation queue  |       | - Direct Email Provider         |
|                               |       |   (Resend API / SES / SMTP)     |
| Enterprise Target (Production)|       | - Signed X-Calendar-Signature   |
|  - PostgreSQL (primary DB)    |       | - Delivery audit log            |
|  - Redis Pub/Sub (SSE fanout) |       +---------------------------------+
|  - BullMQ / SQS (job queue)   |
+-------------------------------+
```

### How Each Connection Works

| Connection | Protocol / Transport | Direction | Purpose |
| :--- | :--- | :--- | :--- |
| **Dashboard ↔ Calendar UI** | `<iframe>` (`?embed=1`) + `postMessage` | Client ↔ Client | Embeds calendar inside your portal and emits sanitized `calendar:eventSelected` & `calendar:eventChanged` summaries to the parent frame. |
| **Frontend ↔ Backend API** | HTTPS REST JSON (`X-Requested-With`) | Client → Server | CRUD on events, webhooks, email rules, delivery logs, and reminder triggers with optimistic locking (`expectedVersion` / `409 Conflict`). |
| **Multi-Client Live Sync** | Server-Sent Events (`GET /api/stream`) | Server → Clients | Pushes `event.created`, `event.updated`, `event.deleted`, `events.reset`, and `delivery.logged` in real time to all connected dashboard users. |
| **External Guests ↔ Calendar** | Public URL (`/?share=<token>`) + REST | Guest → Server | Standalone RSVP page allowing external clients to view details, download `.ics`, join video meetings, and submit Going / Maybe / Decline RSVPs. |
| **External Calendar Apps** | HTTP RFC 5545 (`GET /api/ics/feed.ics`) | External → Server | Live subscribable iCalendar feed for Outlook, Apple Calendar, and Google Calendar (supports `?category=` and `?token=`). |
| **Calendar ↔ Workflow / Email** | HTTPS POST Webhook + HMAC-SHA256 | Server → External | Dispatches signed JSON payloads to n8n, Zapier, Make, Slack, or your email service on every lifecycle event, RSVP, and reminder. |
| **Cron Scheduler ↔ Calendar** | HTTPS POST (`/api/notifications/dispatch`) | Cron → Server | External cron job triggers upcoming reminder checks and email/webhook fan-out every 5–15 minutes. |

---

## 2. REST, Streaming & Webhook Endpoint Contract

All protected endpoints accept `X-API-Key: <CALENDAR_API_KEY>` or `Authorization: Bearer <CALENDAR_API_KEY>` when `CALENDAR_API_KEY` is configured in environment variables.

### Events API
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check, connected SSE client count, event/webhook counts, email provider status. |
| `GET` | `/api/events` | List events. Query params: `from`, `to`, `category`, `search`. |
| `POST` | `/api/events` | Create single event or recurring batch (`{ events: [...], notifyAttendees: true }`). Fires `event.created` + email automation. |
| `PATCH` | `/api/events/:id` | Update event. Pass `expectedVersion` (or `If-Match` header) for optimistic locking. Returns `409 Conflict` with `{ latest }` if modified concurrently. |
| `DELETE` | `/api/events/:id` | Delete event and trigger `event.deleted` + cancellation email automation. |
| `POST` | `/api/events/reset` | Reset events to the demo dataset (disable or restrict to admin in production). |

### Public Share, RSVP & Feed API
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/share/:token` | Public lookup by `shareToken`. Automatically redacts private notes/attachments if `visibility === 'private'`. |
| `POST` | `/api/share/:token/rsvp` | Submit guest RSVP `{ name, email, status: "accepted" \| "tentative" \| "declined" }`. Broadcasts SSE update and triggers `event.rsvp`. |
| `GET` | `/api/ics/feed.ics` | Live RFC 5545 `.ics` feed. Optional `?category=meetings` or `?token=<shareToken>`. |
| `GET` | `/api/stream` | Server-Sent Events stream (`text/event-stream`) with 25s keepalive heartbeats. |

### Workflow Webhooks & Email Automation API
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/webhooks` | List registered outbound workflow endpoints. |
| `POST` | `/api/webhooks` | Register HTTPS webhook `{ name, url, events: [...] }`. Validates public HTTPS URLs (blocks private/loopback IPs). |
| `PATCH` | `/api/webhooks/:id` | Pause or resume webhook `{ active: boolean }`. |
| `DELETE` | `/api/webhooks/:id` | Remove webhook endpoint. |
| `POST` | `/api/webhooks/:id/test` | Send a live HMAC-SHA256 signed test payload and log delivery status. |
| `GET` / `PUT` | `/api/email-automation` | Read or update automated email trigger rules (`sendOnCreate`, `sendOnUpdate`, `sendOnCancel`, `sendOnRsvp`, `sendReminders`, `senderName`, `replyToEmail`). |
| `POST` | `/api/notifications/dispatch` | Trigger reminders for a specific `{ eventId }` or upcoming window `{ windowMinutes: 60 }`. |
| `GET` | `/api/deliveries` | Audit log of webhook and email automation dispatches. |

### Outbound Webhook Payload & Signature Verification

Every outbound webhook POST includes:
- `X-Calendar-Event`: Trigger name (`event.created`, `event.updated`, `event.deleted`, `event.rsvp`, `event.reminder`, `email.dispatch`)
- `X-Calendar-Signature`: `sha256=<hex_hmac>` computed using `WEBHOOK_SIGNING_SECRET`

```json
{
  "id": "msg_7a91c03d8e4b2f10",
  "type": "event.created",
  "occurredAt": "2026-11-23T10:30:00.000Z",
  "data": {
    "event": {
      "id": "evt-123",
      "shareToken": "q4-roadmap-review",
      "version": 1,
      "title": "Q4 Product Roadmap Review",
      "start": "2026-11-24T11:00",
      "end": "2026-11-24T12:30",
      "attendees": [{ "email": "client@acme.com", "status": "needsAction" }]
    },
    "shareUrl": "https://your-domain.com/?share=q4-roadmap-review"
  }
}
```

Verify signatures in your receiving backend or workflow:

```ts
import crypto from 'node:crypto';

export function verifyCalendarSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  if (expected.length !== signatureHeader.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}
```

---

## 3. Production Database Schema (PostgreSQL)

The current `server.ts` uses an atomic JSON file store (`.data/calendar-store.json`) with an in-process write queue so the app runs out of the box with zero external dependencies.

When deploying for **enterprise scale and high concurrency**, replace the store functions in `server.ts` with PostgreSQL using the schema below:

```sql
-- 1. Multi-Tenant Organizations / Workspaces
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  api_key_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Calendars / Layers per Tenant
CREATE TABLE calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  color VARCHAR(16) NOT NULL DEFAULT '#4F46E5',
  UNIQUE (tenant_id, slug)
);

-- 3. Events (with Optimistic Concurrency version + Share Token)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE,
  group_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  location TEXT,
  meeting_url TEXT,
  description TEXT,
  organizer_email TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  availability TEXT NOT NULL DEFAULT 'busy' CHECK (availability IN ('busy', 'free')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- High-concurrency range query index (month/week/day viewport fetches)
CREATE INDEX idx_events_tenant_range ON events (tenant_id, start_at, end_at);
CREATE INDEX idx_events_group ON events (tenant_id, group_id) WHERE group_id IS NOT NULL;

-- 4. Event Attendees & Guest RSVPs
CREATE TABLE event_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'needsAction'
    CHECK (status IN ('needsAction', 'accepted', 'tentative', 'declined')),
  responded_at TIMESTAMPTZ,
  UNIQUE (event_id, email)
);

CREATE INDEX idx_attendees_event ON event_attendees (event_id);

-- 5. Scheduled Reminders (indexed for fast worker polling)
CREATE TABLE event_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  minutes_before INTEGER NOT NULL CHECK (minutes_before >= 0),
  channel TEXT NOT NULL CHECK (channel IN ('browser', 'email', 'webhook')),
  next_fire_at TIMESTAMPTZ NOT NULL,
  fired_at TIMESTAMPTZ
);

-- Partial index so background reminder workers scan ONLY pending reminders
CREATE INDEX idx_reminders_pending ON event_reminders (next_fire_at)
  WHERE fired_at IS NULL;

-- 6. Event Resource Attachments
CREATE TABLE event_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL
);

-- 7. Outbound Workflow Webhooks
CREATE TABLE webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,
  signing_secret_encrypted TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Email Automation Config per Tenant
CREATE TABLE email_automation_configs (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sender_name TEXT NOT NULL DEFAULT 'Enterprise Calendar',
  reply_to_email TEXT NOT NULL,
  send_on_create BOOLEAN NOT NULL DEFAULT TRUE,
  send_on_update BOOLEAN NOT NULL DEFAULT TRUE,
  send_on_cancel BOOLEAN NOT NULL DEFAULT TRUE,
  send_on_rsvp BOOLEAN NOT NULL DEFAULT TRUE,
  send_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Webhook & Email Delivery Audit Log (with Retry Tracking)
CREATE TABLE automation_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  trigger TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('webhook', 'email')),
  target TEXT NOT NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'delivered', 'failed')),
  http_status INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deliveries_tenant_time ON automation_deliveries (tenant_id, created_at DESC);
```

---

## 4. Scaling Strategy for Enterprise Concurrency

When scaling beyond a single Node.js instance to thousands of concurrent dashboard clients:

1. **Optimistic Concurrency Control (Already Wired in the API Contract)**
   Use atomic conditional updates in PostgreSQL so simultaneous edits never silently clobber each other:
   ```sql
   UPDATE events
   SET title = $1, start_at = $2, end_at = $3, version = version + 1, updated_at = NOW()
   WHERE id = $4 AND tenant_id = $5 AND version = $6
   RETURNING *;
   ```
   If 0 rows are returned, query the latest row and return `HTTP 409 Conflict` with `{ latest }` — the frontend already handles `409` automatically by syncing the latest state!

2. **Horizontal Real-Time Sync via Redis Pub/Sub**
   Replace the in-memory `sseClients` broadcast in `server.ts` with Redis Pub/Sub (`calendar:tenant:<tenantId>`). When Instance A updates an event, it publishes to Redis; Instances A, B, and C all push the SSE frame to their connected browser clients.

3. **Asynchronous Queue for Email & Webhooks (BullMQ / AWS SQS / Cloud Tasks)**
   Never block `POST /api/events` on slow external SMTP/webhook servers:
   - Enqueue a job `{ trigger, eventId, idempotencyKey }` immediately after the DB transaction commits (or use the **Transactional Outbox** pattern).
   - Worker fleet processes jobs with concurrency limits, exponential backoff retries (e.g., 5 attempts over 1 hour), and dead-letter logging into `automation_deliveries`.

4. **Dedicated Reminder Worker (`FOR UPDATE SKIP LOCKED`)**
   Run a lightweight worker every 30 seconds:
   ```sql
   SELECT * FROM event_reminders
   WHERE fired_at IS NULL AND next_fire_at <= NOW()
   ORDER BY next_fire_at ASC
   LIMIT 200
   FOR UPDATE SKIP LOCKED;
   ```
   `SKIP LOCKED` guarantees multiple horizontally scaled workers never send duplicate reminder emails.

5. **Connection Pooling & Rate Limiting**
   - Place **PgBouncer** (transaction pooling mode) in front of PostgreSQL.
   - Move the in-memory `rateBucket` limiter in `server.ts` to **Redis-backed sliding-window rate limiting** (`rate-limiter-flexible`).

6. **Tenant Authentication**
   Replace `checkApiAuth` in `server.ts` with your enterprise dashboard's JWT / SSO middleware, injecting `req.tenantId` and `req.userId` so every query is strictly scoped by `tenant_id`.

---

## 5. Dashboard Embedding Guide

Drop the calendar straight into your existing website or admin dashboard:

```html
<iframe
  src="https://your-calendar-host/?embed=1&view=timeGridWeek&theme=breezy"
  title="Enterprise Calendar"
  style="width: 100%; height: 760px; border: 1px solid #e2e8f0; border-radius: 12px;"
  loading="lazy"
></iframe>
```

Listen for real-time calendar events in your host dashboard:

```js
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://your-calendar-host') return;
  if (event.data?.source === 'fullcalendar-studio') {
    // event.data.type: 'calendar:eventSelected' | 'calendar:eventChanged'
    console.log(event.data.type, event.data.payload);
  }
});
```

---

## 6. Project Structure

```text
├── server.ts                          # Express API, SSE stream, ICS feed, webhook & email pipeline
├── src/
│   ├── App.tsx                        # Main workspace, SSE sync, reminder scheduler, embed & share router
│   ├── index.css                      # Tailwind v4 + official FullCalendar v7 themes & palettes
│   ├── types/calendar.ts              # Shared TypeScript contracts for events, webhooks & automation
│   ├── data/seedEvents.ts             # Initial enterprise schedule, categories, themes, locales
│   ├── utils/
│   │   ├── api.ts                     # Typed REST client with 409 Conflict optimistic-lock handling
│   │   └── icsExport.ts               # Date math, recurrence, safe URL validation, RFC 5545 ICS builder
│   └── components/
│       ├── Sidebar.tsx                # Mini-calendar, layers, draggable backlog, theme/locale/API controls
│       ├── MiniCalendar.tsx           # Interactive date jump calendar
│       ├── DraggableBacklog.tsx       # FullCalendar v7 Draggable external tasks
│       ├── EventModal.tsx             # Full Google Calendar–class event editor, guests, reminders, sharing
│       ├── ShareEventView.tsx         # Standalone public event & guest RSVP page (/?share=<token>)
│       ├── IntegrationsModal.tsx      # Email rules, webhooks, REST docs, embed snippet & delivery log
│       └── RichDescription.tsx        # Safe structured description renderer (no raw HTML injection)
├── .env.example                       # Server-side secret & integration placeholders
└── package.json                       # Scripts: dev (tsx server.ts), build (vite build), start (node server.ts)
```

---

## 7. Environment Variables & Local Setup

Copy `.env.example` to `.env` and configure any optional server-side keys:

| Variable | Required | Description |
| :--- | :---: | :--- |
| `PORT` | No | Server port (defaults to `3000`). |
| `APP_URL` | No | Public base URL used in generated share links and webhook payloads. |
| `CALENDAR_API_KEY` | Recommended (Prod) | API key required on external `/api/*` requests via `X-API-Key` or `Authorization: Bearer`. |
| `WEBHOOK_SIGNING_SECRET` | Recommended (Prod) | Secret used to compute HMAC-SHA256 `X-Calendar-Signature` headers on outbound webhooks. |
| `RESEND_API_KEY` | Optional | Enables direct transactional email sending via Resend on event invites, updates, RSVPs, and reminders. |
| `EMAIL_FROM_ADDRESS` | Optional | Verified sender address used with `RESEND_API_KEY`. |
| `EMAIL_AUTOMATION_WEBHOOK_URL` | Optional | Default HTTPS workflow URL (e.g., n8n / Make / Zapier / custom worker) receiving `email.dispatch` jobs. |

### Commands

```bash
npm install
npm run dev      # Starts Express + Vite middleware on http://localhost:3000
npm run lint     # TypeScript type-check (tsc --noEmit)
npm run build    # Builds production frontend bundle into dist/
NODE_ENV=production npm start
```
