import {
  Bell,
  Download,
  Link2,
  Moon,
  RotateCcw,
  Sun,
  Webhook,
  X,
} from 'lucide-react';
import {
  CALENDAR_CATEGORIES,
  OFFICIAL_THEMES,
  SUPPORTED_LOCALES,
} from '../data/seedEvents';
import type {
  BacklogTask,
  CalendarCategoryId,
  CalendarSettings,
  FullCalendarThemeId,
} from '../types/calendar';
import { DraggableBacklog } from './DraggableBacklog';
import { MiniCalendar } from './MiniCalendar';

interface SidebarProps {
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  selectedDate: Date;
  eventDateKeys: Set<string>;
  onSelectDate: (date: Date) => void;
  visibleCategories: Record<CalendarCategoryId, boolean>;
  categoryCounts: Record<CalendarCategoryId, number>;
  onToggleCategory: (categoryId: CalendarCategoryId) => void;
  backlogTasks: BacklogTask[];
  onAddBacklogTask: (task: Omit<BacklogTask, 'id'>) => void;
  onDeleteBacklogTask: (taskId: string) => void;
  settings: CalendarSettings;
  onUpdateSettings: (patch: Partial<CalendarSettings>) => void;
  onEnableBrowserNotifications: () => void;
  onOpenIntegrations: () => void;
  onCopyIcsFeedUrl: () => void;
  onExportIcs: () => void;
  onResetDemo: () => void;
}

export function Sidebar({
  isOpenMobile,
  onCloseMobile,
  selectedDate,
  eventDateKeys,
  onSelectDate,
  visibleCategories,
  categoryCounts,
  onToggleCategory,
  backlogTasks,
  onAddBacklogTask,
  onDeleteBacklogTask,
  settings,
  onUpdateSettings,
  onEnableBrowserNotifications,
  onOpenIntegrations,
  onCopyIcsFeedUrl,
  onExportIcs,
  onResetDemo,
}: SidebarProps) {
  const sidebarBody = (
    <div className="h-full flex flex-col bg-slate-50/90 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 lg:hidden">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Workspace Controls
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close sidebar"
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto studio-scroll p-4 space-y-6">
        <MiniCalendar
          selectedDate={selectedDate}
          eventDateKeys={eventDateKeys}
          onSelectDate={(date) => {
            onSelectDate(date);
            onCloseMobile();
          }}
        />

        <hr className="border-slate-200 dark:border-slate-800" />

        {/* Enterprise Workflow & API Integration Entry */}
        <section aria-label="Enterprise integrations" className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-tight">
            Automation & API
          </h3>
          <button
            type="button"
            onClick={() => {
              onOpenIntegrations();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            <span className="inline-flex items-center gap-2 truncate">
              <Webhook className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Endpoints & Email Rules</span>
            </span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCopyIcsFeedUrl}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Copy Feed</span>
            </button>
            <button
              type="button"
              onClick={onEnableBrowserNotifications}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                settings.browserNotificationsEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>{settings.browserNotificationsEnabled ? 'Alerts On' : 'Alerts'}</span>
            </button>
          </div>
        </section>

        <hr className="border-slate-200 dark:border-slate-800" />

        <section aria-label="Calendar layers">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-tight mb-2.5">
            Calendars
          </h3>
          <div className="space-y-1.5">
            {CALENDAR_CATEGORIES.map((category) => {
              const checked = visibleCategories[category.id];
              return (
                <label
                  key={category.id}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-800/70 cursor-pointer transition-colors select-none"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleCategory(category.id)}
                      className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span
                      aria-hidden="true"
                      className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                      style={{ backgroundColor: category.color }}
                    />
                    <span
                      className={`text-xs truncate ${
                        checked
                          ? 'text-slate-800 dark:text-slate-200 font-medium'
                          : 'text-slate-400 dark:text-slate-500 line-through'
                      }`}
                    >
                      {category.label}
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    {categoryCounts[category.id]}
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        <hr className="border-slate-200 dark:border-slate-800" />

        <DraggableBacklog
          tasks={backlogTasks}
          removeAfterDrop={settings.removeAfterDrop}
          onToggleRemoveAfterDrop={(value) =>
            onUpdateSettings({ removeAfterDrop: value })
          }
          onAddTask={onAddBacklogTask}
          onDeleteTask={onDeleteBacklogTask}
        />

        <hr className="border-slate-200 dark:border-slate-800" />

        <section aria-label="FullCalendar configuration" className="space-y-4">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-tight">
            Calendar Options
          </h3>

          <div className="space-y-2.5">
            <div>
              <label
                htmlFor="fc-theme-select"
                className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                Official Theme
              </label>
              <select
                id="fc-theme-select"
                value={settings.theme}
                onChange={(e) =>
                  onUpdateSettings({ theme: e.target.value as FullCalendarThemeId })
                }
                className="w-full px-2.5 py-1.5 text-xs rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {OFFICIAL_THEMES.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="fc-locale-select"
                className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                Locale
              </label>
              <select
                id="fc-locale-select"
                value={settings.locale}
                onChange={(e) => onUpdateSettings({ locale: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {SUPPORTED_LOCALES.map((loc) => (
                  <option key={loc.code} value={loc.code}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <span>Show weekends</span>
              <input
                type="checkbox"
                checked={settings.weekends}
                onChange={(e) => onUpdateSettings({ weekends: e.target.checked })}
                className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <span>Week numbers</span>
              <input
                type="checkbox"
                checked={settings.weekNumbers}
                onChange={(e) => onUpdateSettings({ weekNumbers: e.target.checked })}
                className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <span>Highlight business hours</span>
              <input
                type="checkbox"
                checked={settings.businessHours}
                onChange={(e) => onUpdateSettings({ businessHours: e.target.checked })}
                className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onUpdateSettings({ darkMode: !settings.darkMode })}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <span>{settings.darkMode ? 'Light appearance' : 'Dark appearance'}</span>
              {settings.darkMode ? (
                <Sun className="w-3.5 h-3.5 text-amber-500" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onExportIcs}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export .ics</span>
              </button>
              <button
                type="button"
                onClick={onResetDemo}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Demo</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[276px] shrink-0 h-full overflow-hidden">
        {sidebarBody}
      </aside>

      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 lg:hidden flex bg-slate-950/45 backdrop-blur-[2px]"
          onClick={onCloseMobile}
        >
          <aside
            className="w-[290px] max-w-[85vw] h-full"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarBody}
          </aside>
        </div>
      )}
    </>
  );
}
