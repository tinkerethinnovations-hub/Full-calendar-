import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Link2,
  MapPin,
  Users,
  Video,
} from 'lucide-react';
import { CATEGORY_MAP } from '../data/seedEvents';
import type { AttendeeRsvpStatus, CalendarEventRecord } from '../types/calendar';
import { apiFetchSharedEvent, apiSubmitGuestRsvp } from '../utils/api';
import {
  buildAddToGoogleCalendarUrl,
  buildEventShareUrl,
  downloadIcsFile,
  formatFullEventSchedule,
  isSafeExternalUrl,
} from '../utils/icsExport';
import { RichDescription } from './RichDescription';

interface ShareEventViewProps {
  shareToken: string;
  onExitShareView: () => void;
}

const RSVP_LABELS: Record<AttendeeRsvpStatus, string> = {
  accepted: 'Going',
  tentative: 'Maybe',
  declined: 'Declined',
  needsAction: 'Invited',
};

export function ShareEventView({
  shareToken,
  onExitShareView,
}: ShareEventViewProps) {
  const [event, setEvent] = useState<CalendarEventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [submittingRsvp, setSubmittingRsvp] = useState(false);
  const [rsvpFeedback, setRsvpFeedback] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetchSharedEvent(shareToken)
      .then((res) => {
        if (!active) return;
        setEvent(res.event);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : 'Unable to load shared event.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [shareToken]);

  const handleCopyLink = async () => {
    if (!event) return;
    try {
      await navigator.clipboard.writeText(buildEventShareUrl(event));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleSubmitRsvp = async (status: AttendeeRsvpStatus) => {
    if (!event) return;
    const email = guestEmail.trim();
    if (!email || !email.includes('@')) {
      setRsvpFeedback('Please enter a valid email address before responding.');
      return;
    }
    setSubmittingRsvp(true);
    setRsvpFeedback(null);
    try {
      const updated = await apiSubmitGuestRsvp(event.shareToken, {
        name: guestName.trim(),
        email,
        status,
      });
      setEvent(updated);
      setRsvpFeedback(
        `Response saved as "${RSVP_LABELS[status]}". Organizer & workflow notifications triggered.`,
      );
    } catch (err) {
      setRsvpFeedback(
        err instanceof Error ? err.message : 'Failed to save RSVP.',
      );
    } finally {
      setSubmittingRsvp(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] flex items-center justify-center p-6">
        <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 space-y-4 animate-pulse">
          <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-7 w-2/3 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-24 w-full bg-slate-100 dark:bg-slate-800/60 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
          <Calendar className="w-8 h-8 mx-auto text-slate-400" />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Shared Event Not Found
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {error || 'This share link may have been removed or replaced.'}
          </p>
          <button
            type="button"
            onClick={onExitShareView}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Open Calendar Workspace</span>
          </button>
        </div>
      </div>
    );
  }

  const category = CATEGORY_MAP[event.categoryId];
  const hasMeetingLink = Boolean(
    event.meetingUrl && isSafeExternalUrl(event.meetingUrl),
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
      <header className="h-14 px-6 flex items-center justify-between gap-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120]">
        <button
          type="button"
          onClick={onExitShareView}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors whitespace-nowrap"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>FullCalendar</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Link Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Share Link</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => downloadIcsFile([event], `${event.shareToken}.ics`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .ics</span>
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <article className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-6 sm:p-8 border-b border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                style={{ backgroundColor: category.color }}
              />
              <span>{category.label}</span>
              <span aria-hidden="true">·</span>
              <span>{event.availability === 'free' ? 'Free' : 'Busy'}</span>
              <span aria-hidden="true">·</span>
              <span>{event.visibility === 'private' ? 'Private' : 'Shared Event'}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 text-balance">
              {event.title}
            </h1>

            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                <span className="tabular-nums">{formatFullEventSchedule(event)}</span>
              </div>

              {event.location && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                  <span>{event.location}</span>
                </div>
              )}

              {hasMeetingLink && event.meetingUrl && (
                <div className="flex items-center gap-2.5 pt-1">
                  <Video className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <a
                    href={event.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                  >
                    <span>Join Video Meeting</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-4 text-xs">
              <a
                href={buildAddToGoogleCalendarUrl(event)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Add to Google Calendar</span>
              </a>
              <button
                type="button"
                onClick={() => downloadIcsFile([event], `${event.shareToken}.ics`)}
                className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Apple / Outlook (.ics)</span>
              </button>
            </div>
          </div>

          {/* Description & Attachments */}
          <div className="p-6 sm:p-8 border-b border-slate-200 dark:border-slate-800 space-y-6">
            <div>
              <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Event Description
              </h2>
              <RichDescription text={event.notes} />
            </div>

            {event.attachments && event.attachments.length > 0 && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2.5">
                  Attachments & Links
                </h2>
                <div className="space-y-2">
                  {event.attachments.map((att) =>
                    isSafeExternalUrl(att.url) ? (
                      <a
                        key={att.id}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-xs transition-colors"
                      >
                        <span className="inline-flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200 truncate">
                          <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{att.label}</span>
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </a>
                    ) : null,
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Interactive Guest RSVP Section */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Respond to Invitation
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Submitting your RSVP updates the host calendar in real time and notifies connected workflows.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Your name"
                  aria-label="Your name"
                  className="px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="you@company.com"
                  aria-label="Your email"
                  className="px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={submittingRsvp}
                  onClick={() => handleSubmitRsvp('accepted')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                >
                  Yes, I am going
                </button>
                <button
                  type="button"
                  disabled={submittingRsvp}
                  onClick={() => handleSubmitRsvp('tentative')}
                  className="px-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                >
                  Maybe
                </button>
                <button
                  type="button"
                  disabled={submittingRsvp}
                  onClick={() => handleSubmitRsvp('declined')}
                  className="px-4 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                >
                  Decline
                </button>
              </div>

              {rsvpFeedback && (
                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 pt-1">
                  {rsvpFeedback}
                </p>
              )}
            </div>

            {/* Guest List */}
            {event.attendees && event.attendees.length > 0 && (
              <div className="pt-5 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-slate-400" />
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                    Guests ({event.attendees.length})
                  </h3>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {event.attendees.map((att) => (
                    <div
                      key={att.email}
                      className="py-2 flex items-center justify-between gap-4 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {att.name || att.email}
                        </span>
                        {att.name && (
                          <span className="text-slate-500 dark:text-slate-400 ml-2">
                            {att.email}
                          </span>
                        )}
                      </div>
                      <span
                        className={`font-medium shrink-0 ${
                          att.status === 'accepted'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : att.status === 'declined'
                              ? 'text-rose-600 dark:text-rose-400'
                              : att.status === 'tentative'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {RSVP_LABELS[att.status]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </article>
      </main>
    </div>
  );
}
