export type CalendarCategoryId = 'product' | 'meetings' | 'operations' | 'milestones';

export interface CalendarCategory {
  id: CalendarCategoryId;
  label: string;
  color: string;
  textColor: string;
}

export type AttendeeRsvpStatus = 'needsAction' | 'accepted' | 'tentative' | 'declined';

export interface EventAttendee {
  email: string;
  name?: string;
  status: AttendeeRsvpStatus;
  respondedAt?: string;
}

export type ReminderChannel = 'browser' | 'email' | 'webhook';

export interface EventReminder {
  id: string;
  minutesBefore: number;
  channel: ReminderChannel;
}

export interface EventAttachment {
  id: string;
  label: string;
  url: string;
}

export type EventVisibility = 'public' | 'private';
export type EventAvailability = 'busy' | 'free';
export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface CalendarEventRecord {
  id: string;
  shareToken: string;
  version: number;
  updatedAt: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  timezone: string;
  categoryId: CalendarCategoryId;
  location?: string;
  meetingUrl?: string;
  notes?: string;
  organizerEmail?: string;
  attendees: EventAttendee[];
  reminders: EventReminder[];
  attachments: EventAttachment[];
  visibility: EventVisibility;
  availability: EventAvailability;
  groupId?: string;
}

export interface BacklogTask {
  id: string;
  title: string;
  durationMinutes: number;
  categoryId: CalendarCategoryId;
}

export type FullCalendarThemeId = 'breezy' | 'monarch' | 'forma' | 'pulse' | 'classic';

export type CalendarViewId =
  | 'dayGridMonth'
  | 'timeGridWeek'
  | 'timeGridDay'
  | 'listWeek'
  | 'multiMonthYear';

export interface CalendarSettings {
  theme: FullCalendarThemeId;
  locale: string;
  timezone: string;
  weekends: boolean;
  weekNumbers: boolean;
  businessHours: boolean;
  darkMode: boolean;
  removeAfterDrop: boolean;
  browserNotificationsEnabled: boolean;
}

export interface EventFormValues {
  id?: string;
  shareToken?: string;
  version?: number;
  title: string;
  categoryId: CalendarCategoryId;
  allDay: boolean;
  timezone: string;
  start: string;
  end: string;
  location: string;
  meetingUrl: string;
  notes: string;
  attendees: EventAttendee[];
  reminders: EventReminder[];
  attachments: EventAttachment[];
  visibility: EventVisibility;
  availability: EventAvailability;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceCount: number;
  notifyAttendees: boolean;
}

export type WebhookTriggerType =
  | 'event.created'
  | 'event.updated'
  | 'event.deleted'
  | 'event.rsvp'
  | 'event.reminder'
  | 'email.dispatch';

export interface WebhookSubscription {
  id: string;
  name: string;
  url: string;
  events: WebhookTriggerType[];
  active: boolean;
  createdAt: string;
}

export interface EmailAutomationConfig {
  enabled: boolean;
  senderName: string;
  replyToEmail: string;
  sendOnCreate: boolean;
  sendOnUpdate: boolean;
  sendOnCancel: boolean;
  sendOnRsvp: boolean;
  sendReminders: boolean;
}

export interface DeliveryLogEntry {
  id: string;
  timestamp: string;
  trigger: WebhookTriggerType;
  channel: 'webhook' | 'email';
  target: string;
  eventTitle: string;
  status: 'delivered' | 'queued' | 'failed';
  httpStatus?: number;
  detail: string;
}

export interface InAppNotification {
  id: string;
  eventId: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

export interface ToastActionState {
  id: string;
  message: string;
  canUndo?: boolean;
}
