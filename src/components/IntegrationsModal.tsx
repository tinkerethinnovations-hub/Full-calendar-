import { useEffect, useState } from 'react';
import {
  Activity,
  Check,
  Code2,
  Copy,
  Mail,
  Plus,
  Send,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import { OFFICIAL_THEMES } from '../data/seedEvents';
import type {
  CalendarViewId,
  DeliveryLogEntry,
  EmailAutomationConfig,
  FullCalendarThemeId,
  WebhookSubscription,
  WebhookTriggerType,
} from '../types/calendar';
import {
  apiCreateWebhook,
  apiDeleteWebhook,
  apiDispatchNotifications,
  apiFetchDeliveries,
  apiFetchEmailAutomation,
  apiFetchWebhooks,
  apiTestWebhook,
  apiToggleWebhook,
  apiUpdateEmailAutomation,
} from '../utils/api';

interface IntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotifyToast: (message: string) => void;
}

type ModalTab = 'automation' | 'endpoints' | 'embed' | 'logs';

const ALL_TRIGGERS: { id: WebhookTriggerType; label: string }[] = [
  { id: 'event.created', label: 'event.created' },
  { id: 'event.updated', label: 'event.updated' },
  { id: 'event.deleted', label: 'event.deleted' },
  { id: 'event.rsvp', label: 'event.rsvp' },
  { id: 'event.reminder', label: 'event.reminder' },
  { id: 'email.dispatch', label: 'email.dispatch' },
];

export function IntegrationsModal({
  isOpen,
  onClose,
  onNotifyToast,
}: IntegrationsModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('automation');
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([]);
  const [emailConfig, setEmailConfig] = useState<EmailAutomationConfig | null>(null);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [deliveries, setDeliveries] = useState<DeliveryLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // New webhook form state
  const [hookName, setHookName] = useState('');
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState<WebhookTriggerType[]>([
    'event.created',
    'event.updated',
    'event.rsvp',
    'email.dispatch',
  ]);
  const [hookError, setHookError] = useState<string | null>(null);
  const [submittingHook, setSubmittingHook] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [dispatchingReminders, setDispatchingReminders] = useState(false);

  // Embed snippet builder state
  const [embedView, setEmbedView] = useState<CalendarViewId>('timeGridWeek');
  const [embedTheme, setEmbedTheme] = useState<FullCalendarThemeId>('breezy');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://your-calendar-app.run.app';

  const loadData = async () => {
    setLoading(true);
    try {
      const [hooks, emailRes, logs] = await Promise.all([
        apiFetchWebhooks(),
        apiFetchEmailAutomation(),
        apiFetchDeliveries(),
      ]);
      setWebhooks(hooks);
      setEmailConfig(emailRes.config);
      setProviderConfigured(emailRes.providerConfigured);
      setDeliveries(logs);
    } catch {
      // Keep graceful UI state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void loadData();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const toggleTriggerSelection = (trigger: WebhookTriggerType) => {
    setHookEvents((prev) =>
      prev.includes(trigger)
        ? prev.filter((item) => item !== trigger)
        : [...prev, trigger],
    );
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setHookError(null);
    if (!hookName.trim() || !hookUrl.trim()) {
      setHookError('Enter a workflow name and a valid HTTPS endpoint URL.');
      return;
    }
    if (hookEvents.length === 0) {
      setHookError('Select at least one trigger event.');
      return;
    }
    setSubmittingHook(true);
    try {
      const created = await apiCreateWebhook({
        name: hookName.trim(),
        url: hookUrl.trim(),
        events: hookEvents,
      });
      setWebhooks((prev) => [created, ...prev]);
      setHookName('');
      setHookUrl('');
      onNotifyToast(`Workflow endpoint "${created.name}" registered`);
    } catch (err) {
      setHookError(
        err instanceof Error ? err.message : 'Failed to register webhook.',
      );
    } finally {
      setSubmittingHook(false);
    }
  };

  const handleToggleWebhook = async (hook: WebhookSubscription) => {
    try {
      const updated = await apiToggleWebhook(hook.id, !hook.active);
      setWebhooks((prev) => prev.map((w) => (w.id === hook.id ? updated : w)));
    } catch {
      // Ignore
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      await apiDeleteWebhook(id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      onNotifyToast('Webhook endpoint removed');
    } catch {
      // Ignore
    }
  };

  const handleTestWebhook = async (id: string) => {
    setTestingId(id);
    try {
      const delivery = await apiTestWebhook(id);
      setDeliveries((prev) => [delivery, ...prev]);
      onNotifyToast(
        delivery.status === 'delivered'
          ? `Test webhook delivered (HTTP ${delivery.httpStatus})`
          : `Test dispatch: ${delivery.detail}`,
      );
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : 'Webhook test failed.',
      );
    } finally {
      setTestingId(null);
    }
  };

  const handleSaveEmailConfig = async (patch: Partial<EmailAutomationConfig>) => {
    if (!emailConfig) return;
    const optimistic = { ...emailConfig, ...patch };
    setEmailConfig(optimistic);
    try {
      const saved = await apiUpdateEmailAutomation(patch);
      setEmailConfig(saved);
    } catch {
      // Ignore
    }
  };

  const handleDispatchNow = async () => {
    setDispatchingReminders(true);
    try {
      const result = await apiDispatchNotifications({ windowMinutes: 1440 });
      const freshLogs = await apiFetchDeliveries();
      setDeliveries(freshLogs);
      onNotifyToast(
        `Dispatched reminders for ${result.dispatchedCount} upcoming event(s)`,
      );
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : 'Failed to dispatch reminders.',
      );
    } finally {
      setDispatchingReminders(false);
    }
  };

  const embedUrl = `${origin}/?embed=1&view=${embedView}&theme=${embedTheme}`;
  const iframeSnippet = `<iframe\n  src="${embedUrl}"\n  title="Enterprise Calendar"\n  style="width: 100%; height: 760px; border: 1px solid #e2e8f0; border-radius: 12px;"\n  loading="lazy"\n></iframe>`;

  const postMessageSnippet = `window.addEventListener('message', (event) => {\n  if (event.origin !== '${origin}') return;\n  if (event.data?.source === 'fullcalendar-studio') {\n    console.log('Calendar event:', event.data.type, event.data.payload);\n  }\n});`;

  const createEventCurl = `curl -X POST "${origin}/api/events" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "title": "Enterprise Client Onboarding",\n    "start": "2026-11-24T10:00",\n    "end": "2026-11-24T11:00",\n    "categoryId": "meetings",\n    "meetingUrl": "https://meet.jit.si/client-onboarding",\n    "notes": "## Agenda\\n- Dashboard SSO walkthrough\\n- Webhook setup",\n    "attendees": [{ "email": "client@acme.com", "name": "Alex Rivera" }],\n    "notifyAttendees": true\n  }'`;

  const cronReminderCurl = `curl -X POST "${origin}/api/notifications/dispatch" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "windowMinutes": 60 }'`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="integrations-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-6 py-4 flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2
              id="integrations-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Enterprise Endpoints, Email Automation & Dashboard Embed
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Connect n8n, Zapier, Make, Resend, or your own backend — no Google OAuth verification required.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close integrations panel"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="shrink-0 px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-6 overflow-x-auto">
          {(
            [
              { id: 'automation', label: 'Email & Webhooks', icon: Webhook },
              { id: 'endpoints', label: 'REST Endpoints', icon: Code2 },
              { id: 'embed', label: 'Dashboard Embed', icon: Mail },
              {
                id: 'logs',
                label: `Delivery Log (${deliveries.length})`,
                icon: Activity,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 pb-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto studio-scroll p-6 space-y-8">
          {activeTab === 'automation' && (
            <>
              {/* Email Automation Section */}
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Automated Email Dispatch Rules
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {providerConfigured
                        ? 'Server email provider detected. Emails deliver directly on triggers.'
                        : 'Fires signed email.dispatch payloads to any connected workflow webhook (n8n, Make, Zapier, or Resend via server env).'}
                    </p>
                  </div>
                  {emailConfig && (
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={emailConfig.enabled}
                        onChange={(e) =>
                          handleSaveEmailConfig({ enabled: e.target.checked })
                        }
                        className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Enable email automation</span>
                    </label>
                  )}
                </div>

                {emailConfig && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Sender Name
                      </label>
                      <input
                        type="text"
                        value={emailConfig.senderName}
                        onChange={(e) =>
                          handleSaveEmailConfig({ senderName: e.target.value })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Reply-To Address
                      </label>
                      <input
                        type="email"
                        value={emailConfig.replyToEmail}
                        onChange={(e) =>
                          handleSaveEmailConfig({ replyToEmail: e.target.value })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {emailConfig && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                    {(
                      [
                        ['sendOnCreate', 'Invite on event creation'],
                        ['sendOnUpdate', 'Notify on reschedule / edit'],
                        ['sendOnCancel', 'Send cancellation notice'],
                        ['sendOnRsvp', 'Notify when guests RSVP'],
                        ['sendReminders', 'Automated event reminders'],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={emailConfig[key]}
                          onChange={(e) =>
                            handleSaveEmailConfig({ [key]: e.target.checked })
                          }
                          className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </section>

              <hr className="border-slate-200 dark:border-slate-800" />

              {/* Outbound Workflow Webhooks */}
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Outbound Workflow Endpoints (HMAC-SHA256 Signed)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Every request includes <code className="font-mono text-[11px]">X-Calendar-Event</code> and <code className="font-mono text-[11px]">X-Calendar-Signature</code> headers. HTTPS public endpoints only.
                  </p>
                </div>

                <form
                  onSubmit={handleCreateWebhook}
                  className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  {hookError && (
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                      {hookError}
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      value={hookName}
                      onChange={(e) => setHookName(e.target.value)}
                      placeholder="Workflow name (e.g. n8n Emailer)"
                      className="px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="url"
                      value={hookUrl}
                      onChange={(e) => setHookUrl(e.target.value)}
                      placeholder="https://your-workflow.example.com/webhook"
                      className="sm:col-span-2 px-3 py-2 text-xs font-mono rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {ALL_TRIGGERS.map((tr) => {
                        const selected = hookEvents.includes(tr.id);
                        return (
                          <button
                            key={tr.id}
                            type="button"
                            onClick={() => toggleTriggerSelection(tr.id)}
                            className={`px-2.5 py-1 text-[11px] font-mono rounded-md border transition-colors ${
                              selected
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                            }`}
                          >
                            {tr.label}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="submit"
                      disabled={submittingHook}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Endpoint</span>
                    </button>
                  </div>
                </form>

                {loading ? (
                  <p className="text-xs text-slate-500">Loading registered webhooks...</p>
                ) : webhooks.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                    No outbound workflow endpoints registered yet. Add your n8n, Make, Zapier, or custom backend URL above.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {webhooks.map((hook) => (
                      <div
                        key={hook.id}
                        className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {hook.name}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span
                              className={
                                hook.active
                                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                  : 'text-slate-400'
                              }
                            >
                              {hook.active ? 'Active' : 'Paused'}
                            </span>
                          </div>
                          <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {hook.url}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            Triggers: {hook.events.join(', ')}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={testingId === hook.id}
                            onClick={() => handleTestWebhook(hook.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-md transition-colors whitespace-nowrap"
                          >
                            <Send className="w-3 h-3" />
                            <span>{testingId === hook.id ? 'Sending...' : 'Test'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleWebhook(hook)}
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap"
                          >
                            {hook.active ? 'Pause' : 'Resume'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteWebhook(hook.id)}
                            aria-label={`Delete ${hook.name}`}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === 'endpoints' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Live Calendar REST & Streaming Endpoints
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Built with serialized write locking, optimistic concurrency versioning (<code className="font-mono text-[11px]">expectedVersion</code> / <code className="font-mono text-[11px]">ETag</code>), and Server-Sent Events for real-time multi-client sync.
                </p>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {[
                  ['GET', '/api/events', 'List events (?from=, ?to=, ?category=, ?search=)'],
                  ['POST', '/api/events', 'Create event(s) and trigger email & workflow automations'],
                  ['PATCH', '/api/events/:id', 'Update event with optimistic concurrency (expectedVersion)'],
                  ['DELETE', '/api/events/:id', 'Cancel event and dispatch event.deleted notifications'],
                  ['GET', '/api/share/:token', 'Fetch public shareable event payload by token'],
                  ['POST', '/api/share/:token/rsvp', 'Submit external guest RSVP & fire event.rsvp webhook'],
                  ['GET', '/api/ics/feed.ics', 'Subscribable RFC 5545 iCalendar feed for Apple/Outlook/Google'],
                  ['GET', '/api/stream', 'Real-time Server-Sent Events stream across concurrent dashboards'],
                  ['POST', '/api/notifications/dispatch', 'Cron-compatible trigger to send upcoming reminders'],
                ].map(([method, endpoint, desc]) => (
                  <div
                    key={`${method}-${endpoint}`}
                    className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono font-semibold text-[11px] w-14 text-indigo-600 dark:text-indigo-400 shrink-0">
                        {method}
                      </span>
                      <code className="font-mono text-xs text-slate-900 dark:text-slate-100 truncate">
                        {endpoint}
                      </code>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500 dark:text-slate-400">{desc}</span>
                      <button
                        type="button"
                        onClick={() => copyText(endpoint, `${origin}${endpoint}`)}
                        className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
                        aria-label={`Copy ${endpoint} URL`}
                      >
                        {copiedKey === endpoint ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Example: Create Event + Trigger Email Workflow
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText('curl-create', createEventCurl)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400"
                  >
                    {copiedKey === 'curl-create' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedKey === 'curl-create' ? 'Copied' : 'Copy cURL'}</span>
                  </button>
                </div>
                <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-100 text-[11px] font-mono overflow-x-auto leading-relaxed">
                  {createEventCurl}
                </pre>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Example: Cron Job Reminder Trigger (call every 15–60 min)
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText('curl-cron', cronReminderCurl)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400"
                  >
                    {copiedKey === 'curl-cron' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedKey === 'curl-cron' ? 'Copied' : 'Copy cURL'}</span>
                  </button>
                </div>
                <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-100 text-[11px] font-mono overflow-x-auto leading-relaxed">
                  {cronReminderCurl}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'embed' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Embed Inside Your Enterprise Dashboard
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mount the calendar directly inside your existing website or client portal with frameless embed mode (<code className="font-mono text-[11px]">?embed=1</code>) and real-time parent-window events.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Initial View
                  </label>
                  <select
                    value={embedView}
                    onChange={(e) => setEmbedView(e.target.value as CalendarViewId)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="dayGridMonth">Month</option>
                    <option value="timeGridWeek">Week</option>
                    <option value="timeGridDay">Day</option>
                    <option value="listWeek">List</option>
                    <option value="multiMonthYear">Year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Theme
                  </label>
                  <select
                    value={embedTheme}
                    onChange={(e) => setEmbedTheme(e.target.value as FullCalendarThemeId)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {OFFICIAL_THEMES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Dashboard iframe Snippet
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText('iframe', iframeSnippet)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400"
                  >
                    {copiedKey === 'iframe' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedKey === 'iframe' ? 'Copied' : 'Copy HTML'}</span>
                  </button>
                </div>
                <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-100 text-[11px] font-mono overflow-x-auto leading-relaxed">
                  {iframeSnippet}
                </pre>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Parent Dashboard Event Listener (postMessage)
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText('postmsg', postMessageSnippet)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400"
                  >
                    {copiedKey === 'postmsg' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedKey === 'postmsg' ? 'Copied' : 'Copy JS'}</span>
                  </button>
                </div>
                <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-100 text-[11px] font-mono overflow-x-auto leading-relaxed">
                  {postMessageSnippet}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Automation & Email Delivery Log
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Live audit trail of webhook dispatches and email automation jobs.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={dispatchingReminders}
                  onClick={handleDispatchNow}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {dispatchingReminders
                      ? 'Dispatching...'
                      : 'Dispatch Upcoming Reminders (24h)'}
                  </span>
                </button>
              </div>

              {deliveries.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                  No automation dispatches recorded yet. Create or update an event with guests, or test a webhook to see entries here.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <tr>
                          <th className="py-2.5 px-3 font-medium">Time</th>
                          <th className="py-2.5 px-3 font-medium">Trigger</th>
                          <th className="py-2.5 px-3 font-medium">Event</th>
                          <th className="py-2.5 px-3 font-medium">Target</th>
                          <th className="py-2.5 px-3 font-medium text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {deliveries.map((item) => (
                          <tr
                            key={item.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                          >
                            <td className="py-2.5 px-3 font-mono text-[11px] tabular-nums text-slate-500 whitespace-nowrap">
                              {new Date(item.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {item.trigger}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100 max-w-[180px] truncate">
                              {item.eventTitle}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 max-w-[240px]">
                              <div className="truncate font-mono text-[11px]">{item.target}</div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {item.detail}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap font-medium">
                              <span
                                className={
                                  item.status === 'delivered'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : item.status === 'queued'
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                }
                              >
                                {item.status === 'delivered'
                                  ? 'Delivered'
                                  : item.status === 'queued'
                                    ? 'Queued'
                                    : 'Failed'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
