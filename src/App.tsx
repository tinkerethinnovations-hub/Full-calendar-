/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar, {
  type CalendarRef,
  type DateSelectInfo,
  type DatesSetInfo,
  type EventClickInfo,
  type EventDropInfo,
  type EventInput,
  type EventReceiveInfo,
  type EventResizeDoneInfo,
  type PluginInput,
} from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import interactionPlugin from '@fullcalendar/react/interaction';
import listPlugin from '@fullcalendar/react/list';
import allLocales from '@fullcalendar/react/locales-all';
import multiMonthPlugin from '@fullcalendar/react/multimonth';
import breezyThemePlugin from '@fullcalendar/react/themes/breezy';
import classicThemePlugin from '@fullcalendar/react/themes/classic';
import formaThemePlugin from '@fullcalendar/react/themes/forma';
import monarchThemePlugin from '@fullcalendar/react/themes/monarch';
import pulseThemePlugin from '@fullcalendar/react/themes/pulse';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Menu,
  Plus,
  Search,
  Undo2,
  X,
} from 'lucide-react';
import { EventModal } from './components/EventModal';
import { IntegrationsModal } from './components/IntegrationsModal';
import { ShareEventView } from './components/ShareEventView';
import { Sidebar } from './components/Sidebar';
import {
  CATEGORY_MAP,
  DEFAULT_SETTINGS,
  INITIAL_BACKLOG_TASKS,
  createSeedEvents,
} from './data/seedEvents';
import type {
  BacklogTask,
  CalendarCategoryId,
  CalendarEventRecord,
  CalendarSettings,
  CalendarViewId,
  EventFormValues,
  FullCalendarThemeId,
  InAppNotification,
  ToastActionState,
} from './types/calendar';
import {
  ApiConflictError,
  apiCreateEvents,
  apiDeleteEvent,
  apiDispatchNotifications,
  apiFetchEvents,
  apiResetDemoEvents,
  apiUpdateEvent,
} from './utils/api';
import {
  addDaysToDateString,
  addMinutesToDateTimeString,
  downloadIcsFile,
  formatShortEventTime,
  normalizeEventDateForInput,
  shiftIsoByRecurrence,
  toLocalDateString,
  toLocalDateTimeInput,
} from './utils/icsExport';

const STORAGE_KEYS = {
  backlog: 'fc_studio_backlog_v2',
  settings: 'fc_studio_settings_v2',
};

const VIEW_TABS: { id: CalendarViewId; label: string }[] = [
  { id: 'dayGridMonth', label: 'Month' },
  { id: 'timeGridWeek', label: 'Week' },
  { id: 'timeGridDay', label: 'Day' },
  { id: 'listWeek', label: 'List' },
  { id: 'multiMonthYear', label: 'Year' },
];

const THEME_PLUGIN_MAP: Record<FullCalendarThemeId, PluginInput> = {
  breezy: breezyThemePlugin,
  monarch: monarchThemePlugin,
  forma: formaThemePlugin,
  pulse: pulseThemePlugin,
  classic: classicThemePlugin,
};

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getInitialUrlParams() {
  if (typeof window === 'undefined') {
    return { shareToken: null, isEmbed: false, view: null, theme: null };
  }
  const params = new URLSearchParams(window.location.search);
  const viewParam = params.get('view') as CalendarViewId | null;
  const themeParam = params.get('theme') as FullCalendarThemeId | null;
  return {
    shareToken: params.get('share')?.trim() || null,
    isEmbed: params.get('embed') === '1',
    view:
      viewParam && VIEW_TABS.some((v) => v.id === viewParam) ? viewParam : null,
    theme:
      themeParam && themeParam in THEME_PLUGIN_MAP ? themeParam : null,
  };
}

function createDefaultFormValues(
  anchorDate = new Date(),
  timezone = DEFAULT_SETTINGS.timezone,
): EventFormValues {
  const start = new Date(anchorDate);
  start.setHours(10, 0, 0, 0);
  const startStr = toLocalDateTimeInput(start);
  return {
    title: '',
    categoryId: 'product',
    allDay: false,
    timezone,
    start: startStr,
    end: addMinutesToDateTimeString(startStr, 60),
    location: '',
    meetingUrl: '',
    notes: '',
    attendees: [],
    reminders: [
      { id: 'rem-default-1', minutesBefore: 10, channel: 'browser' },
      { id: 'rem-default-2', minutesBefore: 30, channel: 'email' },
    ],
    attachments: [],
    visibility: 'public',
    availability: 'busy',
    recurrenceFrequency: 'none',
    recurrenceCount: 1,
    notifyAttendees: true,
  };
}

function sanitizeEventForParentFrame(event: CalendarEventRecord) {
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    categoryId: event.categoryId,
    shareToken: event.shareToken,
    version: event.version,
  };
}

function notifyParentFrame(type: string, payload: unknown): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  try {
    window.parent.postMessage(
      { source: 'fullcalendar-studio', type, payload },
      '*',
    );
  } catch {
    // Ignore postMessage restriction
  }
}

export default function App() {
  const initialParams = useMemo(() => getInitialUrlParams(), []);
  const calendarRef = useRef<CalendarRef | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const firedReminderKeysRef = useRef<Set<string>>(new Set());

  const [activeShareToken, setActiveShareToken] = useState<string | null>(
    initialParams.shareToken,
  );
  const isEmbedMode = initialParams.isEmbed;

  const [events, setEvents] = useState<CalendarEventRecord[]>(() =>
    createSeedEvents(),
  );
  const [undoAction, setUndoAction] = useState<(() => Promise<void>) | null>(
    null,
  );

  const [backlogTasks, setBacklogTasks] = useState<BacklogTask[]>(() =>
    readStoredJson<BacklogTask[]>(STORAGE_KEYS.backlog, INITIAL_BACKLOG_TASKS),
  );
  const [settings, setSettings] = useState<CalendarSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...readStoredJson<Partial<CalendarSettings>>(STORAGE_KEYS.settings, {}),
    ...(initialParams.theme ? { theme: initialParams.theme } : {}),
  }));

  const [visibleCategories, setVisibleCategories] = useState<
    Record<CalendarCategoryId, boolean>
  >({
    product: true,
    meetings: true,
    operations: true,
    milestones: true,
  });

  const [activeView, setActiveView] = useState<CalendarViewId>(
    initialParams.view || 'dayGridMonth',
  );
  const [calendarTitle, setCalendarTitle] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [modalValues, setModalValues] = useState<EventFormValues>(() =>
    createDefaultFormValues(),
  );

  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [toast, setToast] = useState<ToastActionState | null>(null);

  const showToast = useCallback(
    (message: string, undoHandler?: () => Promise<void>) => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      setUndoAction(() => undoHandler || null);
      setToast({
        id: String(Date.now()),
        message,
        canUndo: Boolean(undoHandler),
      });
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
      }, 5000);
    },
    [],
  );

  // Sync dark mode class & FullCalendar v7 data-color-scheme attribute
  useEffect(() => {
    const root = document.documentElement;
    if (settings.darkMode) {
      root.classList.add('dark');
      root.setAttribute('data-color-scheme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-color-scheme', 'light');
    }
  }, [settings.darkMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.backlog,
        JSON.stringify(backlogTasks),
      );
    } catch {
      // Ignore storage error
    }
  }, [backlogTasks]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.settings,
        JSON.stringify(settings),
      );
    } catch {
      // Ignore storage error
    }
  }, [settings]);

  // Initial load from server API + real-time Server-Sent Events subscription
  useEffect(() => {
    let active = true;
    apiFetchEvents()
      .then((serverEvents) => {
        if (active && serverEvents.length > 0) {
          setEvents(serverEvents);
        }
      })
      .catch(() => {
        // Keep seeded events if server temporarily unavailable
      });

    const source = new EventSource('/api/stream');

    const handleCreated = (ev: MessageEvent) => {
      try {
        const created = JSON.parse(ev.data) as CalendarEventRecord;
        setEvents((prev) =>
          prev.some((e) => e.id === created.id) ? prev : [...prev, created],
        );
        notifyParentFrame('calendar:eventChanged', {
          action: 'created',
          event: sanitizeEventForParentFrame(created),
        });
      } catch {
        // Ignore malformed SSE payload
      }
    };

    const handleUpdated = (ev: MessageEvent) => {
      try {
        const updated = JSON.parse(ev.data) as CalendarEventRecord;
        setEvents((prev) => {
          const exists = prev.some((e) => e.id === updated.id);
          return exists
            ? prev.map((e) => (e.id === updated.id ? updated : e))
            : [...prev, updated];
        });
        notifyParentFrame('calendar:eventChanged', {
          action: 'updated',
          event: sanitizeEventForParentFrame(updated),
        });
      } catch {
        // Ignore malformed SSE payload
      }
    };

    const handleDeleted = (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data) as { id: string };
        setEvents((prev) => prev.filter((e) => e.id !== payload.id));
        notifyParentFrame('calendar:eventChanged', {
          action: 'deleted',
          id: payload.id,
        });
      } catch {
        // Ignore malformed SSE payload
      }
    };

    const handleReset = (ev: MessageEvent) => {
      try {
        const list = JSON.parse(ev.data) as CalendarEventRecord[];
        setEvents(list);
      } catch {
        // Ignore
      }
    };

    source.addEventListener('event.created', handleCreated);
    source.addEventListener('event.updated', handleUpdated);
    source.addEventListener('event.deleted', handleDeleted);
    source.addEventListener('events.reset', handleReset);

    return () => {
      active = false;
      source.close();
    };
  }, []);

  // Browser & in-app upcoming reminder scheduler
  useEffect(() => {
    const checkReminders = () => {
      const nowMs = Date.now();
      for (const evt of events) {
        if (evt.allDay || !evt.reminders?.length) continue;
        const startMs = new Date(evt.start).getTime();
        if (Number.isNaN(startMs) || startMs < nowMs - 60_000) continue;

        for (const rem of evt.reminders) {
          if (rem.channel !== 'browser') continue;
          const triggerAt = startMs - rem.minutesBefore * 60_000;
          const key = `${evt.id}:${rem.id}:${evt.start}`;
          if (
            nowMs >= triggerAt &&
            nowMs <= startMs + 60_000 &&
            !firedReminderKeysRef.current.has(key)
          ) {
            firedReminderKeysRef.current.add(key);
            const body = `Starts at ${formatShortEventTime(evt.start, false)}${
              evt.location ? ` · ${evt.location}` : ''
            }`;

            setNotifications((prev) => [
              {
                id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                eventId: evt.id,
                title: `Reminder: ${evt.title}`,
                body,
                timestamp: new Date().toISOString(),
                read: false,
              },
              ...prev.slice(0, 24),
            ]);

            if (
              settings.browserNotificationsEnabled &&
              typeof Notification !== 'undefined' &&
              Notification.permission === 'granted'
            ) {
              try {
                new Notification(evt.title, { body });
              } catch {
                // Ignore browser notification failure in restricted iframes
              }
            }
          }
        }
      }
    };

    checkReminders();
    const timer = window.setInterval(checkReminders, 20_000);
    return () => window.clearInterval(timer);
  }, [events, settings.browserNotificationsEnabled]);

  const handleEnableBrowserNotifications = async () => {
    if (typeof Notification === 'undefined') {
      showToast('Desktop notifications are not supported in this browser.');
      return;
    }
    if (settings.browserNotificationsEnabled) {
      setSettings((prev) => ({ ...prev, browserNotificationsEnabled: false }));
      showToast('Browser reminder alerts paused');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setSettings((prev) => ({ ...prev, browserNotificationsEnabled: true }));
        showToast('Desktop browser notifications enabled');
      } else {
        showToast('Notification permission blocked by browser settings');
      }
    } catch {
      showToast('Unable to request browser notification permission');
    }
  };

  const handleOpenSharePreview = (token: string) => {
    setModalOpen(false);
    setActiveShareToken(token);
    const nextUrl = `${window.location.pathname}?share=${encodeURIComponent(token)}`;
    window.history.pushState({}, '', nextUrl);
  };

  const handleExitShareView = () => {
    setActiveShareToken(null);
    window.history.pushState({}, '', window.location.pathname);
    apiFetchEvents()
      .then((serverEvents) => setEvents(serverEvents))
      .catch(() => undefined);
  };

  // Active plugin list including the selected official FullCalendar v7 theme
  const plugins = useMemo<PluginInput[]>(
    () => [
      THEME_PLUGIN_MAP[settings.theme],
      dayGridPlugin,
      timeGridPlugin,
      listPlugin,
      multiMonthPlugin,
      interactionPlugin,
    ],
    [settings.theme],
  );

  const categoryCounts = useMemo<Record<CalendarCategoryId, number>>(() => {
    const counts: Record<CalendarCategoryId, number> = {
      product: 0,
      meetings: 0,
      operations: 0,
      milestones: 0,
    };
    for (const evt of events) {
      counts[evt.categoryId] = (counts[evt.categoryId] || 0) + 1;
    }
    return counts;
  }, [events]);

  const eventDateKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const evt of events) {
      if (!visibleCategories[evt.categoryId]) continue;
      keys.add(evt.start.slice(0, 10));
    }
    return keys;
  }, [events, visibleCategories]);

  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return events.filter((evt) => {
      if (!visibleCategories[evt.categoryId]) return false;
      if (!query) return true;
      return (
        evt.title.toLowerCase().includes(query) ||
        (evt.location && evt.location.toLowerCase().includes(query)) ||
        (evt.notes && evt.notes.toLowerCase().includes(query)) ||
        evt.attendees.some(
          (a) =>
            a.email.toLowerCase().includes(query) ||
            (a.name && a.name.toLowerCase().includes(query)),
        )
      );
    });
  }, [events, visibleCategories, searchQuery]);

  const calendarEventInputs = useMemo<EventInput[]>(() => {
    return filteredRecords.map((evt) => {
      const cat = CATEGORY_MAP[evt.categoryId];
      return {
        id: evt.id,
        groupId: evt.groupId,
        title: evt.title,
        start: evt.start,
        end: evt.end,
        allDay: evt.allDay,
        backgroundColor: cat.color,
        borderColor: cat.color,
        textColor: cat.textColor,
        extendedProps: {
          categoryId: evt.categoryId,
          location: evt.location || '',
          notes: evt.notes || '',
          shareToken: evt.shareToken,
        },
      };
    });
  }, [filteredRecords]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  // If viewing a working shareable event link (?share=<token>), render the dedicated guest RSVP view
  if (activeShareToken) {
    return (
      <ShareEventView
        shareToken={activeShareToken}
        onExitShareView={handleExitShareView}
      />
    );
  }

  // Navigation helpers
  const handleViewChange = (viewId: CalendarViewId) => {
    setActiveView(viewId);
    calendarRef.current?.getApi().changeView(viewId);
  };

  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (direction === 'prev') api.prev();
    else if (direction === 'next') api.next();
    else api.today();
  };

  const handleMiniCalendarSelect = (date: Date) => {
    setSelectedDate(date);
    calendarRef.current?.getApi().gotoDate(date);
  };

  const handleDatesSet = (info: DatesSetInfo) => {
    setCalendarTitle(info.view.title);
    const viewType = info.view.type as CalendarViewId;
    if (VIEW_TABS.some((tab) => tab.id === viewType)) {
      setActiveView(viewType);
    }
    const current = info.view.calendar.getDate();
    if (current) {
      setSelectedDate(current);
    }
  };

  const handleOpenNewEvent = () => {
    setIsEditingEvent(false);
    setModalValues(createDefaultFormValues(selectedDate, settings.timezone));
    setModalOpen(true);
  };

  const handleDateSelect = (selectInfo: DateSelectInfo) => {
    selectInfo.view.calendar.unselect();
    const startInput = normalizeEventDateForInput(
      selectInfo.startStr || selectInfo.start,
      selectInfo.allDay,
    );
    const endInput = normalizeEventDateForInput(
      selectInfo.endStr || selectInfo.end,
      selectInfo.allDay,
    );

    setIsEditingEvent(false);
    setModalValues({
      ...createDefaultFormValues(selectedDate, settings.timezone),
      allDay: selectInfo.allDay,
      start: startInput,
      end: endInput,
    });
    setModalOpen(true);
  };

  const openEditModalForRecord = (record: CalendarEventRecord) => {
    const startInput = normalizeEventDateForInput(record.start, record.allDay);
    const endInput = record.end
      ? normalizeEventDateForInput(record.end, record.allDay)
      : record.allDay
        ? addDaysToDateString(startInput, 1)
        : addMinutesToDateTimeString(startInput, 60);

    setIsEditingEvent(true);
    setModalValues({
      id: record.id,
      shareToken: record.shareToken,
      version: record.version,
      title: record.title,
      categoryId: record.categoryId,
      allDay: record.allDay,
      timezone: record.timezone || settings.timezone,
      start: startInput,
      end: endInput,
      location: record.location || '',
      meetingUrl: record.meetingUrl || '',
      notes: record.notes || '',
      attendees: record.attendees || [],
      reminders: record.reminders || [],
      attachments: record.attachments || [],
      visibility: record.visibility || 'public',
      availability: record.availability || 'busy',
      recurrenceFrequency: 'none',
      recurrenceCount: 1,
      notifyAttendees: true,
    });
    setModalOpen(true);
    notifyParentFrame(
      'calendar:eventSelected',
      sanitizeEventForParentFrame(record),
    );
  };

  const handleEventClick = (clickInfo: EventClickInfo) => {
    clickInfo.jsEvent.preventDefault();
    const record = events.find((item) => item.id === clickInfo.event.id);
    if (!record) return;
    openEditModalForRecord(record);
  };

  const handleEventDrop = async (dropInfo: EventDropInfo) => {
    const moved = dropInfo.event;
    const prevRecord = events.find((e) => e.id === moved.id);
    if (!prevRecord) return;

    const nextStart = normalizeEventDateForInput(
      moved.startStr || moved.start,
      moved.allDay,
    );
    const nextEnd = moved.end
      ? normalizeEventDateForInput(moved.endStr || moved.end, moved.allDay)
      : undefined;

    // Optimistic UI update
    setEvents((prev) =>
      prev.map((item) =>
        item.id === moved.id
          ? { ...item, start: nextStart, end: nextEnd, allDay: moved.allDay }
          : item,
      ),
    );

    try {
      const updated = await apiUpdateEvent(moved.id, {
        start: nextStart,
        end: nextEnd,
        allDay: moved.allDay,
        expectedVersion: prevRecord.version,
      });
      setEvents((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      showToast(
        `Moved "${updated.title}" to ${formatShortEventTime(nextStart, moved.allDay)}`,
        async () => {
          const reverted = await apiUpdateEvent(updated.id, {
            start: prevRecord.start,
            end: prevRecord.end,
            allDay: prevRecord.allDay,
            notifyAttendees: false,
          });
          setEvents((prev) =>
            prev.map((item) => (item.id === reverted.id ? reverted : item)),
          );
        },
      );
    } catch (err) {
      if (err instanceof ApiConflictError) {
        setEvents((prev) =>
          prev.map((item) => (item.id === err.latest.id ? err.latest : item)),
        );
        showToast('Event updated concurrently by another user — synced latest.');
      } else {
        dropInfo.revert();
        setEvents((prev) =>
          prev.map((item) => (item.id === prevRecord.id ? prevRecord : item)),
        );
        showToast('Could not save reschedule.');
      }
    }
  };

  const handleEventResize = async (resizeInfo: EventResizeDoneInfo) => {
    const resized = resizeInfo.event;
    const prevRecord = events.find((e) => e.id === resized.id);
    if (!prevRecord) return;

    const nextStart = normalizeEventDateForInput(
      resized.startStr || resized.start,
      resized.allDay,
    );
    const nextEnd = resized.end
      ? normalizeEventDateForInput(resized.endStr || resized.end, resized.allDay)
      : undefined;

    setEvents((prev) =>
      prev.map((item) =>
        item.id === resized.id
          ? { ...item, start: nextStart, end: nextEnd, allDay: resized.allDay }
          : item,
      ),
    );

    try {
      const updated = await apiUpdateEvent(resized.id, {
        start: nextStart,
        end: nextEnd,
        allDay: resized.allDay,
        expectedVersion: prevRecord.version,
      });
      setEvents((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      showToast(`Updated duration for "${updated.title}"`, async () => {
        const reverted = await apiUpdateEvent(updated.id, {
          start: prevRecord.start,
          end: prevRecord.end,
          allDay: prevRecord.allDay,
          notifyAttendees: false,
        });
        setEvents((prev) =>
          prev.map((item) => (item.id === reverted.id ? reverted : item)),
        );
      });
    } catch (err) {
      if (err instanceof ApiConflictError) {
        setEvents((prev) =>
          prev.map((item) => (item.id === err.latest.id ? err.latest : item)),
        );
        showToast('Concurrent update detected — loaded latest version.');
      } else {
        resizeInfo.revert();
        setEvents((prev) =>
          prev.map((item) => (item.id === prevRecord.id ? prevRecord : item)),
        );
        showToast('Could not save resize.');
      }
    }
  };

  const handleEventReceive = async (receiveInfo: EventReceiveInfo) => {
    const received = receiveInfo.event;
    const props = received.extendedProps as {
      categoryId?: CalendarCategoryId;
      backlogTaskId?: string;
      durationMinutes?: number;
    };
    const categoryId = props.categoryId || 'product';
    const durationMinutes = Number(props.durationMinutes || 60);
    const allDayFlag = received.allDay;
    const startVal = normalizeEventDateForInput(
      received.startStr || received.start,
      allDayFlag,
    );
    const endVal = received.end
      ? normalizeEventDateForInput(received.endStr || received.end, allDayFlag)
      : allDayFlag
        ? addDaysToDateString(startVal, 1)
        : addMinutesToDateTimeString(startVal, durationMinutes);

    received.remove();

    setVisibleCategories((prev) =>
      prev[categoryId] ? prev : { ...prev, [categoryId]: true },
    );

    try {
      const createdList = await apiCreateEvents([
        {
          title: received.title || 'Scheduled Task',
          start: startVal,
          end: endVal,
          allDay: allDayFlag,
          timezone: settings.timezone,
          categoryId,
          notes: 'Scheduled from Draggable Backlog.',
          reminders: [{ id: `rem-${Date.now()}`, minutesBefore: 10, channel: 'browser' }],
        },
      ]);
      const created = createdList[0];
      if (created) {
        setEvents((prev) =>
          prev.some((e) => e.id === created.id) ? prev : [...prev, created],
        );
        showToast(
          `Scheduled "${created.title}" on ${formatShortEventTime(startVal, allDayFlag)}`,
          async () => {
            await apiDeleteEvent(created.id);
            setEvents((prev) => prev.filter((e) => e.id !== created.id));
          },
        );
      }
      if (settings.removeAfterDrop && props.backlogTaskId) {
        setBacklogTasks((prev) =>
          prev.filter((task) => task.id !== props.backlogTaskId),
        );
      }
    } catch {
      showToast('Failed to schedule backlog item.');
    }
  };

  const handleSaveModal = async (values: EventFormValues) => {
    setModalOpen(false);

    if (isEditingEvent && values.id) {
      const prevRecord = events.find((e) => e.id === values.id);
      try {
        const updated = await apiUpdateEvent(values.id, {
          title: values.title,
          categoryId: values.categoryId,
          allDay: values.allDay,
          timezone: values.timezone,
          start: values.start,
          end: values.end || undefined,
          location: values.location || undefined,
          meetingUrl: values.meetingUrl || undefined,
          notes: values.notes || undefined,
          attendees: values.attendees,
          reminders: values.reminders,
          attachments: values.attachments,
          visibility: values.visibility,
          availability: values.availability,
          expectedVersion: values.version,
          notifyAttendees: values.notifyAttendees,
        });
        setEvents((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        );
        showToast(
          values.notifyAttendees && values.attendees.length > 0
            ? `Saved "${updated.title}" & dispatched workflow notification`
            : `Updated "${updated.title}"`,
        );
      } catch (err) {
        if (err instanceof ApiConflictError) {
          setEvents((prev) =>
            prev.map((item) => (item.id === err.latest.id ? err.latest : item)),
          );
          showToast(
            'Another user updated this event first. Reloaded latest version.',
          );
        } else {
          if (prevRecord) {
            setEvents((prev) =>
              prev.map((item) => (item.id === prevRecord.id ? prevRecord : item)),
            );
          }
          showToast(
            err instanceof Error ? err.message : 'Failed to save event.',
          );
        }
      }
      return;
    }

    // Creating 1 or N recurring events
    const count =
      values.recurrenceFrequency === 'none'
        ? 1
        : Math.max(2, Math.min(24, values.recurrenceCount || 2));
    const seriesGroupId = count > 1 ? `series-${Date.now()}` : undefined;
    const batch: Partial<CalendarEventRecord>[] = [];

    for (let i = 0; i < count; i++) {
      batch.push({
        groupId: seriesGroupId,
        title: values.title,
        categoryId: values.categoryId,
        allDay: values.allDay,
        timezone: values.timezone,
        start:
          i === 0
            ? values.start
            : shiftIsoByRecurrence(
                values.start,
                i,
                values.recurrenceFrequency,
                values.allDay,
              ),
        end: values.end
          ? i === 0
            ? values.end
            : shiftIsoByRecurrence(
                values.end,
                i,
                values.recurrenceFrequency,
                values.allDay,
              )
          : undefined,
        location: values.location || undefined,
        meetingUrl: values.meetingUrl || undefined,
        notes: values.notes || undefined,
        attendees: values.attendees,
        reminders: values.reminders,
        attachments: values.attachments,
        visibility: values.visibility,
        availability: values.availability,
      });
    }

    setVisibleCategories((prev) =>
      prev[values.categoryId] ? prev : { ...prev, [values.categoryId]: true },
    );

    try {
      const created = await apiCreateEvents(batch, values.notifyAttendees);
      setEvents((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const additions = created.filter((e) => !existingIds.has(e.id));
        return [...prev, ...additions];
      });
      showToast(
        created.length > 1
          ? `Created ${created.length} recurring events & triggered automations`
          : `Created "${created[0]?.title || values.title}"`,
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to create event.',
      );
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const target = events.find((e) => e.id === eventId);
    setModalOpen(false);
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    try {
      await apiDeleteEvent(eventId);
      showToast(
        target ? `Deleted "${target.title}"` : 'Event deleted',
        target
          ? async () => {
              const recreated = await apiCreateEvents([target], false);
              if (recreated[0]) {
                setEvents((prev) => [...prev, recreated[0]]);
              }
            }
          : undefined,
      );
    } catch {
      if (target) {
        setEvents((prev) => [...prev, target]);
      }
      showToast('Failed to delete event.');
    }
  };

  const handleDuplicateEvent = async (values: EventFormValues) => {
    setModalOpen(false);
    const nextStart = values.allDay
      ? addDaysToDateString(values.start, 1)
      : shiftIsoByRecurrence(values.start, 1, 'weekly', false);
    const nextEnd = values.end
      ? values.allDay
        ? addDaysToDateString(values.end, 1)
        : shiftIsoByRecurrence(values.end, 1, 'weekly', false)
      : undefined;

    try {
      const created = await apiCreateEvents(
        [
          {
            title: `${values.title} (Copy)`,
            categoryId: values.categoryId,
            allDay: values.allDay,
            timezone: values.timezone,
            start: nextStart,
            end: nextEnd,
            location: values.location || undefined,
            meetingUrl: values.meetingUrl || undefined,
            notes: values.notes || undefined,
            attendees: values.attendees,
            reminders: values.reminders,
            attachments: values.attachments,
            visibility: values.visibility,
            availability: values.availability,
          },
        ],
        false,
      );
      if (created[0]) {
        setEvents((prev) =>
          prev.some((e) => e.id === created[0].id) ? prev : [...prev, created[0]],
        );
        showToast(`Duplicated "${values.title}"`);
      }
    } catch {
      showToast('Failed to duplicate event.');
    }
  };

  const handleDispatchReminderForEvent = async (eventId: string) => {
    try {
      await apiDispatchNotifications({ eventId });
      showToast('Reminder dispatched to attendees & connected workflows');
    } catch {
      showToast('Failed to dispatch reminder.');
    }
  };

  const handleCopyIcsFeedUrl = async () => {
    const feedUrl = `${window.location.origin}/api/ics/feed.ics`;
    try {
      await navigator.clipboard.writeText(feedUrl);
      showToast('Copied live subscribable .ics feed URL');
    } catch {
      showToast(`Live feed URL: ${feedUrl}`);
    }
  };

  const handleExportIcs = () => {
    const filename = `fullcalendar-${toLocalDateString(new Date())}.ics`;
    downloadIcsFile(filteredRecords, filename);
    showToast(`Exported ${filteredRecords.length} events to ${filename}`);
  };

  const handleResetDemo = async () => {
    try {
      const fresh = await apiResetDemoEvents();
      setEvents(fresh);
      setBacklogTasks(INITIAL_BACKLOG_TASKS);
      setSettings(DEFAULT_SETTINGS);
      setVisibleCategories({
        product: true,
        meetings: true,
        operations: true,
        milestones: true,
      });
      setSearchQuery('');
      calendarRef.current?.getApi().today();
      showToast('Restored default enterprise demo schedule');
    } catch {
      showToast('Could not reset demo events.');
    }
  };

  const handleTriggerUndo = async () => {
    if (!undoAction) return;
    const fn = undoAction;
    setUndoAction(null);
    setToast(null);
    try {
      await fn();
    } catch {
      showToast('Undo could not be completed.');
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
      {/* Strict 3-Zone Top Header Bar (hidden in frameless ?embed=1 mode) */}
      {!isEmbedMode && (
        <header className="h-14 shrink-0 px-4 lg:px-6 flex items-center justify-between gap-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120]">
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              aria-label="Open calendar controls"
              className="lg:hidden p-2 -ml-1 rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0">
              FullCalendar
            </span>
          </div>

          <nav
            aria-label="Calendar views"
            className="hidden sm:flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
          >
            {VIEW_TABS.map((tab) => {
              const active = activeView === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleViewChange(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                    active
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleOpenNewEvent}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              <Plus className="w-4 h-4" />
              <span>New Event</span>
            </button>
          </div>
        </header>
      )}

      {/* Main Workspace Split */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {!isEmbedMode && (
          <Sidebar
            isOpenMobile={isMobileSidebarOpen}
            onCloseMobile={() => setIsMobileSidebarOpen(false)}
            selectedDate={selectedDate}
            eventDateKeys={eventDateKeys}
            onSelectDate={handleMiniCalendarSelect}
            visibleCategories={visibleCategories}
            categoryCounts={categoryCounts}
            onToggleCategory={(categoryId) =>
              setVisibleCategories((prev) => ({
                ...prev,
                [categoryId]: !prev[categoryId],
              }))
            }
            backlogTasks={backlogTasks}
            onAddBacklogTask={(task) =>
              setBacklogTasks((prev) => [
                { ...task, id: `task-${Date.now()}` },
                ...prev,
              ])
            }
            onDeleteBacklogTask={(taskId) =>
              setBacklogTasks((prev) => prev.filter((t) => t.id !== taskId))
            }
            settings={settings}
            onUpdateSettings={(patch) =>
              setSettings((prev) => ({ ...prev, ...patch }))
            }
            onEnableBrowserNotifications={handleEnableBrowserNotifications}
            onOpenIntegrations={() => setIntegrationsOpen(true)}
            onCopyIcsFeedUrl={handleCopyIcsFeedUrl}
            onExportIcs={handleExportIcs}
            onResetDemo={handleResetDemo}
          />
        )}

        <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-[#0B1120]">
          {/* Workspace Sub-Toolbar */}
          <div className="shrink-0 px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 min-w-0">
              <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => handleNavigate('prev')}
                  aria-label="Previous period"
                  className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 rounded-l-lg transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate('today')}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800 border-x border-slate-200 dark:border-slate-800 transition-colors whitespace-nowrap"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate('next')}
                  aria-label="Next period"
                  className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 rounded-r-lg transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                {calendarTitle || 'Calendar'}
              </h1>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              {/* Mobile or embed view selector */}
              <select
                aria-label="Select calendar view"
                value={activeView}
                onChange={(e) => handleViewChange(e.target.value as CalendarViewId)}
                className={`${isEmbedMode ? '' : 'sm:hidden'} px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200`}
              >
                {VIEW_TABS.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.label}
                  </option>
                ))}
              </select>

              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search events or guests..."
                  aria-label="Filter calendar events"
                  className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-950 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search filter"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Functional Notification Inbox */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotificationsOpen((prev) => !prev);
                    setNotifications((prev) =>
                      prev.map((n) => ({ ...n, read: true })),
                    );
                  }}
                  aria-label="Open reminder notifications"
                  className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 transition-colors"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-indigo-600 text-[10px] font-semibold text-white tabular-nums">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 z-40 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        Notifications
                      </span>
                      <button
                        type="button"
                        onClick={() => setNotificationsOpen(false)}
                        aria-label="Close notifications"
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="max-h-72 overflow-y-auto studio-scroll divide-y divide-slate-100 dark:divide-slate-800">
                      {notifications.length === 0 ? (
                        <div className="p-5 text-center space-y-2.5">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            No reminders triggered yet. Upcoming browser alerts appear here automatically.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setNotificationsOpen(false);
                              handleEnableBrowserNotifications();
                            }}
                            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            {settings.browserNotificationsEnabled
                              ? 'Desktop alerts active'
                              : 'Enable desktop notifications'}
                          </button>
                        </div>
                      ) : (
                        notifications.map((ntf) => (
                          <button
                            key={ntf.id}
                            type="button"
                            onClick={() => {
                              const found = events.find((e) => e.id === ntf.eventId);
                              setNotificationsOpen(false);
                              if (found) openEditModalForRecord(found);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                          >
                            <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                              {ntf.title}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {ntf.body}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {isEmbedMode && (
                <button
                  type="button"
                  onClick={handleOpenNewEvent}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New</span>
                </button>
              )}

              <span className="hidden xl:inline text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap shrink-0">
                {searchQuery
                  ? `${filteredRecords.length} of ${events.length} events`
                  : `${filteredRecords.length} events`}
              </span>
            </div>
          </div>

          {searchQuery.trim() !== '' && filteredRecords.length === 0 && (
            <div className="shrink-0 px-6 py-2.5 flex items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-xs">
              <span className="text-slate-600 dark:text-slate-400">
                No scheduled events match &ldquo;{searchQuery.trim()}&rdquo;.
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 whitespace-nowrap"
              >
                Clear filter
              </button>
            </div>
          )}

          {/* FullCalendar v7 Canvas */}
          <div className="flex-1 min-h-0 p-3 lg:p-5 fc-studio-host overflow-hidden">
            <FullCalendar
              key={settings.theme}
              ref={calendarRef}
              plugins={plugins}
              locales={allLocales}
              locale={settings.locale}
              initialView={activeView}
              initialDate={selectedDate}
              headerToolbar={false}
              height="100%"
              events={calendarEventInputs}
              editable={true}
              selectable={true}
              selectMirror={true}
              droppable={true}
              dayMaxEvents={true}
              navLinks={true}
              nowIndicator={true}
              weekends={settings.weekends}
              weekNumbers={settings.weekNumbers}
              businessHours={settings.businessHours}
              slotMinTime="06:00:00"
              slotMaxTime="22:00:00"
              scrollTime="08:30:00"
              datesSet={handleDatesSet}
              select={handleDateSelect}
              eventClick={handleEventClick}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              eventReceive={handleEventReceive}
            />
          </div>
        </main>
      </div>

      {/* Create / Edit Event Modal */}
      <EventModal
        isOpen={modalOpen}
        initialValues={modalValues}
        isEditing={isEditingEvent}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveModal}
        onDelete={handleDeleteEvent}
        onDuplicate={handleDuplicateEvent}
        onOpenSharePreview={handleOpenSharePreview}
        onDispatchReminderNow={handleDispatchReminderForEvent}
      />

      {/* Enterprise API, Webhooks, Email Automation & Dashboard Embed Modal */}
      <IntegrationsModal
        isOpen={integrationsOpen}
        onClose={() => setIntegrationsOpen(false)}
        onNotifyToast={(msg) => showToast(msg)}
      />

      {/* Quiet Feedback / Undo Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-slate-50 border border-slate-800 dark:border-slate-700 shadow-lg text-xs"
        >
          <span>{toast.message}</span>
          {toast.canUndo && undoAction && (
            <button
              type="button"
              onClick={handleTriggerUndo}
              className="inline-flex items-center gap-1 font-semibold text-indigo-300 hover:text-indigo-200 transition-colors whitespace-nowrap"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
