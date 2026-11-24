import type {
  BacklogTask,
  CalendarCategory,
  CalendarEventRecord,
  CalendarSettings,
  EmailAutomationConfig,
} from '../types/calendar';
import { pad2, toLocalDateString } from '../utils/icsExport';

export const CALENDAR_CATEGORIES: CalendarCategory[] = [
  {
    id: 'product',
    label: 'Product & Sprints',
    color: '#4F46E5',
    textColor: '#FFFFFF',
  },
  {
    id: 'meetings',
    label: 'Client & Team',
    color: '#0284C7',
    textColor: '#FFFFFF',
  },
  {
    id: 'operations',
    label: 'Operations',
    color: '#D97706',
    textColor: '#FFFFFF',
  },
  {
    id: 'milestones',
    label: 'Milestones',
    color: '#059669',
    textColor: '#FFFFFF',
  },
];

export const CATEGORY_MAP: Record<CalendarCategory['id'], CalendarCategory> = {
  product: CALENDAR_CATEGORIES[0],
  meetings: CALENDAR_CATEGORIES[1],
  operations: CALENDAR_CATEGORIES[2],
  milestones: CALENDAR_CATEGORIES[3],
};

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English (US)' },
  { code: 'en-gb', label: 'English (UK)' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ja', label: '日本語' },
  { code: 'pt-br', label: 'Português (BR)' },
  { code: 'zh-cn', label: '中文 (简体)' },
  { code: 'ar', label: 'العربية (RTL)' },
];

export const SUPPORTED_TIMEZONES = [
  'Local',
  'UTC',
  'America/Los_Angeles',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const OFFICIAL_THEMES = [
  { id: 'breezy', label: 'Breezy' },
  { id: 'monarch', label: 'Monarch' },
  { id: 'forma', label: 'Forma' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'classic', label: 'Classic' },
] as const;

export const DEFAULT_SETTINGS: CalendarSettings = {
  theme: 'breezy',
  locale: 'en',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  weekends: true,
  weekNumbers: false,
  businessHours: true,
  darkMode: false,
  removeAfterDrop: false,
  browserNotificationsEnabled: false,
};

export const DEFAULT_EMAIL_AUTOMATION: EmailAutomationConfig = {
  enabled: true,
  senderName: 'Enterprise Calendar',
  replyToEmail: 'scheduling@company.com',
  sendOnCreate: true,
  sendOnUpdate: true,
  sendOnCancel: true,
  sendOnRsvp: true,
  sendReminders: true,
};

function offsetDate(anchor: Date, dayOffset: number): Date {
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  d.setDate(d.getDate() + dayOffset);
  return d;
}

function atTime(anchor: Date, dayOffset: number, hour: number, minute = 0): string {
  const d = offsetDate(anchor, dayOffset);
  return `${toLocalDateString(d)}T${pad2(hour)}:${pad2(minute)}`;
}

function allDay(anchor: Date, dayOffset: number): string {
  return toLocalDateString(offsetDate(anchor, dayOffset));
}

export function createSeedEvents(referenceDate = new Date()): CalendarEventRecord[] {
  const currentDay = referenceDate.getDay();
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = offsetDate(referenceDate, diffToMonday);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const nowIso = new Date().toISOString();

  return [
    {
      id: 'evt-standup-1',
      shareToken: 'standup-mon-24',
      version: 1,
      updatedAt: nowIso,
      groupId: 'weekly-standup',
      title: 'Engineering Standup',
      start: atTime(monday, 0, 9, 30),
      end: atTime(monday, 0, 10, 0),
      allDay: false,
      timezone: tz,
      categoryId: 'product',
      location: 'Room 4B',
      meetingUrl: 'https://meet.jit.si/engineering-standup-core',
      organizerEmail: 'eng-ops@company.com',
      notes:
        '## Agenda\n- Sprint 24 velocity & active blockers\n- API concurrency load test metrics\n- Production deployment readiness checklist',
      attendees: [
        { email: 'elena@company.com', name: 'Elena Rostova', status: 'accepted' },
        { email: 'marcus@company.com', name: 'Marcus Chen', status: 'accepted' },
        { email: 'priya@company.com', name: 'Priya Nair', status: 'tentative' },
      ],
      reminders: [
        { id: 'rem-1', minutesBefore: 10, channel: 'browser' },
        { id: 'rem-2', minutesBefore: 30, channel: 'email' },
      ],
      attachments: [
        { id: 'att-1', label: 'Sprint 24 Board', url: 'https://linear.app' },
      ],
      visibility: 'public',
      availability: 'busy',
    },
    {
      id: 'evt-standup-2',
      shareToken: 'standup-wed-24',
      version: 1,
      updatedAt: nowIso,
      groupId: 'weekly-standup',
      title: 'Engineering Standup',
      start: atTime(monday, 2, 9, 30),
      end: atTime(monday, 2, 10, 0),
      allDay: false,
      timezone: tz,
      categoryId: 'product',
      location: 'Room 4B',
      meetingUrl: 'https://meet.jit.si/engineering-standup-core',
      organizerEmail: 'eng-ops@company.com',
      notes: 'Mid-week checkpoint across frontend, webhook pipelines, and client API teams.',
      attendees: [
        { email: 'elena@company.com', name: 'Elena Rostova', status: 'accepted' },
        { email: 'marcus@company.com', name: 'Marcus Chen', status: 'needsAction' },
      ],
      reminders: [{ id: 'rem-3', minutesBefore: 10, channel: 'browser' }],
      attachments: [],
      visibility: 'public',
      availability: 'busy',
    },
    {
      id: 'evt-standup-3',
      shareToken: 'standup-fri-24',
      version: 1,
      updatedAt: nowIso,
      groupId: 'weekly-standup',
      title: 'Engineering Standup',
      start: atTime(monday, 4, 9, 30),
      end: atTime(monday, 4, 10, 0),
      allDay: false,
      timezone: tz,
      categoryId: 'product',
      location: 'Room 4B',
      meetingUrl: 'https://meet.jit.si/engineering-standup-core',
      organizerEmail: 'eng-ops@company.com',
      notes: 'End-of-week demo prep and open PR sign-off.',
      attendees: [
        { email: 'elena@company.com', name: 'Elena Rostova', status: 'accepted' },
      ],
      reminders: [{ id: 'rem-4', minutesBefore: 10, channel: 'browser' }],
      attachments: [],
      visibility: 'public',
      availability: 'busy',
    },
    {
      id: 'evt-roadmap-review',
      shareToken: 'q4-roadmap-review',
      version: 1,
      updatedAt: nowIso,
      title: 'Q4 Product Roadmap Review',
      start: atTime(monday, 0, 11, 0),
      end: atTime(monday, 0, 12, 30),
      allDay: false,
      timezone: tz,
      categoryId: 'meetings',
      location: 'Boardroom North',
      meetingUrl: 'https://meet.jit.si/q4-product-roadmap',
      organizerEmail: 'product@company.com',
      notes:
        '## Objectives\n- Lock December enterprise workflow milestones\n- Review client notification SLA targets\n- Confirm Q1 integration partners',
      attendees: [
        { email: 'sarah.kim@northstar.io', name: 'Sarah Kim', status: 'accepted' },
        { email: 'david.park@company.com', name: 'David Park', status: 'accepted' },
        { email: 'ops-lead@company.com', name: 'Amara Okafor', status: 'needsAction' },
      ],
      reminders: [
        { id: 'rem-5', minutesBefore: 15, channel: 'browser' },
        { id: 'rem-6', minutesBefore: 60, channel: 'email' },
      ],
      attachments: [
        { id: 'att-2', label: 'Q4 Deck & KPIs', url: 'https://docs.google.com' },
      ],
      visibility: 'public',
      availability: 'busy',
    },
    {
      id: 'evt-design-critique',
      shareToken: 'calendar-ux-critique',
      version: 1,
      updatedAt: nowIso,
      title: 'Enterprise Dashboard Embed Review',
      start: atTime(monday, 1, 14, 0),
      end: atTime(monday, 1, 15, 15),
      allDay: false,
      timezone: tz,
      categoryId: 'product',
      location: 'Design Studio',
      meetingUrl: 'https://meet.jit.si/dashboard-embed-review',
      notes:
        '- Verify iframe responsiveness inside client portal\n- Test real-time SSE updates across concurrent tabs\n- Review email automation webhook payloads',
      attendees: [
        { email: 'priya@company.com', name: 'Priya Nair', status: 'accepted' },
      ],
      reminders: [{ id: 'rem-7', minutesBefore: 10, channel: 'browser' }],
      attachments: [],
      visibility: 'public',
      availability: 'busy',
    },
    {
      id: 'evt-client-workshop',
      shareToken: 'northstar-integration',
      version: 1,
      updatedAt: nowIso,
      title: 'Northstar Logistics Webhook Integration',
      start: atTime(monday, 2, 11, 0),
      end: atTime(monday, 2, 12, 30),
      allDay: false,
      timezone: tz,
      categoryId: 'meetings',
      location: 'Virtual Workshop',
      meetingUrl: 'https://meet.jit.si/northstar-webhook-sync',
      notes:
        '## Integration Walkthrough\n- Share REST API endpoint & HMAC signature verification\n- Configure automated email dispatch for shift notifications\n- Verify ICS subscription feed in Outlook',
      attendees: [
        { email: 'cto@northstar.io', name: 'Liam Vance', status: 'accepted' },
        { email: 'integrations@northstar.io', name: 'Northstar DevOps', status: 'tentative' },
      ],
      reminders: [
        { id: 'rem-8', minutesBefore: 15, channel: 'browser' },
        { id: 'rem-9', minutesBefore: 60, channel: 'webhook' },
      ],
      attachments: [],
      visibility: 'public',
      availability: 'busy',
    },
    {
      id: 'evt-deploy-window',
      shareToken: 'prod-release-v72',
      version: 1,
      updatedAt: nowIso,
      title: 'Production Release v7.2 Window',
      start: atTime(monday, 3, 10, 0),
      end: atTime(monday, 3, 12, 0),
      allDay: false,
      timezone: tz,
      categoryId: 'operations',
      location: 'Release Channel',
      notes: 'Zero-downtime rolling rollout with canary health checks and automatic rollback.',
      attendees: [
        { email: 'sre@company.com', name: 'SRE On-Call', status: 'accepted' },
      ],
      reminders: [{ id: 'rem-10', minutesBefore: 30, channel: 'webhook' }],
      attachments: [],
      visibility: 'public',
      availability: 'busy',
    },
    {
      id: 'evt-1on1-elena',
      shareToken: '1on1-elena-rostova',
      version: 1,
      updatedAt: nowIso,
      title: '1:1 with Elena Rostova',
      start: atTime(monday, 3, 15, 0),
      end: atTime(monday, 3, 15, 45),
      allDay: false,
      timezone: tz,
      categoryId: 'meetings',
      location: 'Cafe Terrace',
      notes: 'Career growth goals, architecture ownership, and Q1 hiring pipeline.',
      attendees: [
        { email: 'elena@company.com', name: 'Elena Rostova', status: 'accepted' },
      ],
      reminders: [{ id: 'rem-11', minutesBefore: 10, channel: 'browser' }],
      attachments: [],
      visibility: 'private',
      availability: 'busy',
    },
    {
      id: 'evt-retro',
      shareToken: 'sprint-24-retro',
      version: 1,
      updatedAt: nowIso,
      title: 'Sprint 24 Retrospective',
      start: atTime(monday, 4, 14, 30),
      end: atTime(monday, 4, 16, 0),
      allDay: false,
      timezone: tz,
      categoryId: 'product',
      location: 'Main Commons',
      notes: 'Review completed milestones and select three workflow automation improvements.',
      attendees: [
        { email: 'team@company.com', name: 'Core Engineering', status: 'accepted' },
      ],
      reminders: [{ id: 'rem-12', minutesBefore: 15, channel: 'browser' }],
      attachments: [],
      visibility: 'public',
      availability: 'busy',
    },
    {
      id: 'evt-offsite-multiday',
      shareToken: 'architecture-summit',
      version: 1,
      updatedAt: nowIso,
      title: 'Architecture Summit & Docs Sprint',
      start: allDay(monday, 7),
      end: allDay(monday, 10),
      allDay: true,
      timezone: tz,
      categoryId: 'milestones',
      location: 'Seattle Studio',
      notes: 'Three-day deep dive into high-concurrency scheduling engines and webhook workflows.',
      attendees: [
        { email: 'leadership@company.com', name: 'Engineering Leadership', status: 'accepted' },
      ],
      reminders: [{ id: 'rem-13', minutesBefore: 1440, channel: 'email' }],
      attachments: [],
      visibility: 'public',
      availability: 'busy',
    },
    {
      id: 'evt-launch-freeze',
      shareToken: 'code-freeze-cutoff',
      version: 1,
      updatedAt: nowIso,
      title: 'Code Freeze Cutoff',
      start: allDay(monday, 11),
      end: allDay(monday, 12),
      allDay: true,
      timezone: tz,
      categoryId: 'operations',
      notes: 'No non-critical schema or API changes past 17:00 UTC.',
      attendees: [],
      reminders: [{ id: 'rem-14', minutesBefore: 1440, channel: 'webhook' }],
      attachments: [],
      visibility: 'public',
      availability: 'free',
    },
    {
      id: 'evt-milestone-ga',
      shareToken: 'enterprise-ga-launch',
      version: 1,
      updatedAt: nowIso,
      title: 'Enterprise Portal Launch',
      start: allDay(monday, 14),
      end: allDay(monday, 15),
      allDay: true,
      timezone: tz,
      categoryId: 'milestones',
      notes: 'Open enterprise scheduling portal with live REST & webhook automations.',
      attendees: [
        { email: 'launch@company.com', name: 'Launch Team', status: 'accepted' },
      ],
      reminders: [{ id: 'rem-15', minutesBefore: 1440, channel: 'email' }],
      attachments: [],
      visibility: 'public',
      availability: 'free',
    },
  ];
}

export const INITIAL_BACKLOG_TASKS: BacklogTask[] = [
  {
    id: 'task-1',
    title: 'Connect n8n email reminder workflow',
    durationMinutes: 60,
    categoryId: 'operations',
  },
  {
    id: 'task-2',
    title: 'Client portal onboarding demo',
    durationMinutes: 45,
    categoryId: 'meetings',
  },
  {
    id: 'task-3',
    title: 'Load-test concurrent event updates',
    durationMinutes: 90,
    categoryId: 'product',
  },
  {
    id: 'task-4',
    title: 'Publish API integration guide',
    durationMinutes: 30,
    categoryId: 'milestones',
  },
];
