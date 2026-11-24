import { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Plus,
  Send,
  Share2,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { CALENDAR_CATEGORIES, SUPPORTED_TIMEZONES } from '../data/seedEvents';
import type {
  AttendeeRsvpStatus,
  CalendarCategoryId,
  EventAvailability,
  EventFormValues,
  EventVisibility,
  RecurrenceFrequency,
  ReminderChannel,
} from '../types/calendar';
import {
  addDaysToDateString,
  addMinutesToDateTimeString,
  generateMeetingRoomUrl,
  isSafeExternalUrl,
} from '../utils/icsExport';
import { RichDescription } from './RichDescription';

interface EventModalProps {
  isOpen: boolean;
  initialValues: EventFormValues;
  isEditing: boolean;
  onClose: () => void;
  onSave: (values: EventFormValues) => void;
  onDelete?: (eventId: string) => void;
  onDuplicate?: (values: EventFormValues) => void;
  onOpenSharePreview?: (shareToken: string) => void;
  onDispatchReminderNow?: (eventId: string) => void;
}

const RSVP_STATUS_LABELS: Record<AttendeeRsvpStatus, string> = {
  accepted: 'Going',
  tentative: 'Maybe',
  declined: 'Declined',
  needsAction: 'Invited',
};

export function EventModal({
  isOpen,
  initialValues,
  isEditing,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  onOpenSharePreview,
  onDispatchReminderNow,
}: EventModalProps) {
  const [form, setForm] = useState<EventFormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [descPreview, setDescPreview] = useState(false);

  // Guest input state
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');

  // Attachment input state
  const [attLabel, setAttLabel] = useState('');
  const [attUrl, setAttUrl] = useState('');

  // Copy feedback
  const [copiedShare, setCopiedShare] = useState(false);

  useEffect(() => {
    setForm(initialValues);
    setError(null);
    setDescPreview(false);
    setGuestEmail('');
    setGuestName('');
    setAttLabel('');
    setAttUrl('');
  }, [initialValues, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shareUrl =
    form.shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/?share=${encodeURIComponent(form.shareToken)}`
      : '';

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleToggleAllDay = (checked: boolean) => {
    setForm((prev) => {
      if (checked) {
        const startDate = prev.start.slice(0, 10);
        const endDate = prev.end.slice(0, 10);
        const safeEnd =
          endDate > startDate ? endDate : addDaysToDateString(startDate, 1);
        return {
          ...prev,
          allDay: true,
          start: startDate,
          end: safeEnd,
        };
      }
      const startDateTime = `${prev.start.slice(0, 10)}T09:00`;
      const endDateTime = addMinutesToDateTimeString(startDateTime, 60);
      return {
        ...prev,
        allDay: false,
        start: startDateTime,
        end: endDateTime,
      };
    });
  };

  const handleStartChange = (newStart: string) => {
    setForm((prev) => {
      let nextEnd = prev.end;
      if (prev.allDay) {
        if (!nextEnd || nextEnd <= newStart) {
          nextEnd = addDaysToDateString(newStart, 1);
        }
      } else if (!nextEnd || nextEnd <= newStart) {
        nextEnd = addMinutesToDateTimeString(newStart, 60);
      }
      return { ...prev, start: newStart, end: nextEnd };
    });
  };

  const handleAddAttendee = () => {
    const email = guestEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setError('Enter a valid guest email address.');
      return;
    }
    if (form.attendees.some((a) => a.email.toLowerCase() === email)) {
      setGuestEmail('');
      setGuestName('');
      return;
    }
    setError(null);
    setForm((prev) => ({
      ...prev,
      attendees: [
        ...prev.attendees,
        {
          email,
          name: guestName.trim() || undefined,
          status: 'needsAction',
        },
      ],
    }));
    setGuestEmail('');
    setGuestName('');
  };

  const handleRemoveAttendee = (email: string) => {
    setForm((prev) => ({
      ...prev,
      attendees: prev.attendees.filter((a) => a.email !== email),
    }));
  };

  const handleAddReminder = () => {
    setForm((prev) => ({
      ...prev,
      reminders: [
        ...prev.reminders,
        {
          id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          minutesBefore: 15,
          channel: 'email',
        },
      ],
    }));
  };

  const handleUpdateReminder = (
    id: string,
    patch: { minutesBefore?: number; channel?: ReminderChannel },
  ) => {
    setForm((prev) => ({
      ...prev,
      reminders: prev.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const handleRemoveReminder = (id: string) => {
    setForm((prev) => ({
      ...prev,
      reminders: prev.reminders.filter((r) => r.id !== id),
    }));
  };

  const handleAddAttachment = () => {
    const url = attUrl.trim();
    if (!url || !isSafeExternalUrl(url)) {
      setError('Attachment link must start with https:// or http://.');
      return;
    }
    setError(null);
    setForm((prev) => ({
      ...prev,
      attachments: [
        ...prev.attachments,
        {
          id: `att-${Date.now()}`,
          label: attLabel.trim() || url,
          url,
        },
      ],
    }));
    setAttLabel('');
    setAttUrl('');
  };

  const appendFormatting = (snippet: string) => {
    setDescPreview(false);
    setForm((prev) => ({
      ...prev,
      notes: prev.notes ? `${prev.notes}\n${snippet}` : snippet,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Please enter an event title.');
      return;
    }
    if (!form.start) {
      setError('Please choose a start date.');
      return;
    }
    if (form.end && form.end < form.start) {
      setError('End time must be after start time.');
      return;
    }
    if (form.meetingUrl.trim() && !isSafeExternalUrl(form.meetingUrl.trim())) {
      setError('Meeting URL must start with https:// or http://.');
      return;
    }

    onSave({
      ...form,
      title: form.title.trim(),
      location: form.location.trim(),
      meetingUrl: form.meetingUrl.trim(),
      notes: form.notes.trim(),
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <h2
              id="event-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              {isEditing ? 'Edit Event' : 'Create Event'}
            </h2>
            {isEditing && form.version !== undefined && (
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                rev {form.version}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto studio-scroll p-6 space-y-6">
            {error && (
              <div className="px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-md">
                {error}
              </div>
            )}

            {/* Working Shareable Link Banner (for existing events) */}
            {isEditing && shareUrl && (
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <Share2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Working Share & RSVP Link</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {form.id && onDispatchReminderNow && (
                      <button
                        type="button"
                        onClick={() => onDispatchReminderNow(form.id!)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
                      >
                        <Send className="w-3 h-3" />
                        <span>Send Reminder</span>
                      </button>
                    )}
                    {form.shareToken && onOpenSharePreview && (
                      <button
                        type="button"
                        onClick={() => onOpenSharePreview(form.shareToken!)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                      >
                        <span>Open Page</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    aria-label="Shareable event URL"
                    className="flex-1 px-2.5 py-1.5 text-[11px] font-mono rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                  />
                  <button
                    type="button"
                    onClick={handleCopyShareUrl}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap"
                  >
                    {copiedShare ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Title & Calendar Category */}
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="event-title-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Title
                </label>
                <input
                  id="event-title-input"
                  type="text"
                  value={form.title}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, title: e.target.value }));
                    if (error) setError(null);
                  }}
                  placeholder="e.g. Enterprise Client Review"
                  autoFocus
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CALENDAR_CATEGORIES.map((category) => {
                  const active = form.categoryId === category.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          categoryId: category.id as CalendarCategoryId,
                        }))
                      }
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium border text-left transition-colors ${
                        active
                          ? 'border-indigo-600 bg-indigo-50/70 text-slate-900 dark:bg-indigo-950/50 dark:text-slate-100 dark:border-indigo-500'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="truncate">{category.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Schedule, Timezone & Recurrence */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Date & Time
                </span>
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.allDay}
                    onChange={(e) => handleToggleAllDay(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>All-day event</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="event-start-input"
                    className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                  >
                    Start
                  </label>
                  <input
                    id="event-start-input"
                    type={form.allDay ? 'date' : 'datetime-local'}
                    value={form.start}
                    onChange={(e) => handleStartChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs tabular-nums rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="event-end-input"
                    className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                  >
                    End
                  </label>
                  <input
                    id="event-end-input"
                    type={form.allDay ? 'date' : 'datetime-local'}
                    value={form.end}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, end: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-xs tabular-nums rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="event-tz-select"
                    className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                  >
                    Timezone
                  </label>
                  <select
                    id="event-tz-select"
                    value={form.timezone}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, timezone: e.target.value }))
                    }
                    className="w-full px-2.5 py-2 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    {!SUPPORTED_TIMEZONES.includes(form.timezone) && (
                      <option value={form.timezone}>{form.timezone}</option>
                    )}
                    {SUPPORTED_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>

                {!isEditing && (
                  <>
                    <div>
                      <label
                        htmlFor="event-recurrence-freq"
                        className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                      >
                        Recurrence
                      </label>
                      <select
                        id="event-recurrence-freq"
                        value={form.recurrenceFrequency}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            recurrenceFrequency: e.target.value as RecurrenceFrequency,
                            recurrenceCount:
                              e.target.value === 'none'
                                ? 1
                                : Math.max(2, prev.recurrenceCount),
                          }))
                        }
                        className="w-full px-2.5 py-2 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="none">Does not repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Every 2 weeks</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    {form.recurrenceFrequency !== 'none' && (
                      <div>
                        <label
                          htmlFor="event-recurrence-count"
                          className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                        >
                          Occurrences
                        </label>
                        <input
                          id="event-recurrence-count"
                          type="number"
                          min={2}
                          max={24}
                          value={form.recurrenceCount}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              recurrenceCount: Math.max(
                                2,
                                Math.min(24, Number(e.target.value || 2)),
                              ),
                            }))
                          }
                          className="w-full px-3 py-2 text-xs tabular-nums rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Video Conferencing & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="event-meeting-url"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    <Video className="w-3.5 h-3.5 text-slate-400" />
                    <span>Video Meeting Link</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        meetingUrl: generateMeetingRoomUrl(prev.title || 'meeting'),
                      }))
                    }
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                  >
                    Generate Room
                  </button>
                </div>
                <input
                  id="event-meeting-url"
                  type="url"
                  value={form.meetingUrl}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, meetingUrl: e.target.value }))
                  }
                  placeholder="https://meet.jit.si/..."
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="event-location-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Location
                </label>
                <input
                  id="event-location-input"
                  type="text"
                  value={form.location}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                  placeholder="Room, office, or address"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Rich Event Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="event-notes-input"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Event Description
                </label>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => appendFormatting('## Agenda')}
                    className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    + Heading
                  </button>
                  <button
                    type="button"
                    onClick={() => appendFormatting('- Action item')}
                    className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    + Bullet
                  </button>
                  <button
                    type="button"
                    onClick={() => appendFormatting('**Key decision:** ')}
                    className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    + Bold
                  </button>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                    |
                  </span>
                  <button
                    type="button"
                    onClick={() => setDescPreview((p) => !p)}
                    className="font-medium text-indigo-600 dark:text-indigo-400"
                  >
                    {descPreview ? 'Edit' : 'Preview'}
                  </button>
                </div>
              </div>

              {descPreview ? (
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 min-h-[88px]">
                  <RichDescription text={form.notes} />
                </div>
              ) : (
                <textarea
                  id="event-notes-input"
                  rows={4}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Write agenda, bullet points (- item), headings (## Section), or paste https:// links..."
                  className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 resize-y"
                />
              )}
            </div>

            {/* Guests & Attendees */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>Guests ({form.attendees.length})</span>
                </span>
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.notifyAttendees}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        notifyAttendees: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Trigger email automation on save</span>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAttendee();
                    }
                  }}
                  placeholder="guest@company.com"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAttendee();
                    }
                  }}
                  placeholder="Name (optional)"
                  className="sm:w-36 px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddAttendee}
                  className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Guest</span>
                </button>
              </div>

              {form.attendees.length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                  {form.attendees.map((att) => (
                    <div
                      key={att.email}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {att.name || att.email}
                        </span>
                        {att.name && (
                          <span className="text-slate-500 dark:text-slate-400 ml-1.5">
                            {att.email}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {RSVP_STATUS_LABELS[att.status]}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttendee(att.email)}
                          aria-label={`Remove ${att.email}`}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reminders & Notifications */}
            <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Bell className="w-3.5 h-3.5 text-slate-400" />
                  <span>Notifications & Reminders</span>
                </span>
                <button
                  type="button"
                  onClick={handleAddReminder}
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Reminder</span>
                </button>
              </div>

              {form.reminders.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No reminders configured for this event.
                </p>
              ) : (
                <div className="space-y-2">
                  {form.reminders.map((rem) => (
                    <div key={rem.id} className="flex items-center gap-2">
                      <select
                        value={rem.channel}
                        onChange={(e) =>
                          handleUpdateReminder(rem.id, {
                            channel: e.target.value as ReminderChannel,
                          })
                        }
                        aria-label="Notification channel"
                        className="flex-1 px-2.5 py-1.5 text-xs rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                      >
                        <option value="browser">Browser Notification</option>
                        <option value="email">Email Automation</option>
                        <option value="webhook">Workflow Webhook</option>
                      </select>
                      <select
                        value={rem.minutesBefore}
                        onChange={(e) =>
                          handleUpdateReminder(rem.id, {
                            minutesBefore: Number(e.target.value),
                          })
                        }
                        aria-label="Reminder timing"
                        className="w-36 px-2.5 py-1.5 text-xs tabular-nums rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                      >
                        <option value={5}>5 min before</option>
                        <option value={10}>10 min before</option>
                        <option value={15}>15 min before</option>
                        <option value={30}>30 min before</option>
                        <option value={60}>1 hour before</option>
                        <option value={1440}>1 day before</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveReminder(rem.id)}
                        aria-label="Remove reminder"
                        className="p-1.5 text-slate-400 hover:text-rose-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Attachments & Visibility/Availability */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <Link2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Resource Links & Privacy</span>
              </span>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={attLabel}
                  onChange={(e) => setAttLabel(e.target.value)}
                  placeholder="Link title (e.g. Slides)"
                  className="sm:w-40 px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
                <input
                  type="url"
                  value={attUrl}
                  onChange={(e) => setAttUrl(e.target.value)}
                  placeholder="https://docs.example.com/..."
                  className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleAddAttachment}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap"
                >
                  Attach
                </button>
              </div>

              {form.attachments.length > 0 && (
                <div className="space-y-1.5">
                  {form.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                    >
                      {isSafeExternalUrl(att.url) ? (
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 dark:text-indigo-400 hover:underline truncate"
                        >
                          {att.label}
                        </a>
                      ) : (
                        <span className="text-slate-500 truncate">{att.label}</span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            attachments: prev.attachments.filter((a) => a.id !== att.id),
                          }))
                        }
                        aria-label={`Remove ${att.label}`}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Show As
                  </label>
                  <select
                    value={form.availability}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        availability: e.target.value as EventAvailability,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="busy">Busy</option>
                    <option value="free">Free</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Share Visibility
                  </label>
                  <select
                    value={form.visibility}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        visibility: e.target.value as EventVisibility,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="public">Public (Full details on link)</option>
                    <option value="private">Private (Hide notes on link)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Footer Actions */}
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
            <div className="flex items-center gap-2">
              {isEditing && form.id && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(form.id!)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}
              {isEditing && onDuplicate && (
                <button
                  type="button"
                  onClick={() => onDuplicate(form)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicate</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors whitespace-nowrap"
              >
                {isEditing ? 'Save Changes' : 'Create Event'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
