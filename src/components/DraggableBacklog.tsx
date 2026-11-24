import { useEffect, useRef, useState } from 'react';
import { Draggable } from '@fullcalendar/react/interaction';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { CALENDAR_CATEGORIES, CATEGORY_MAP } from '../data/seedEvents';
import type { BacklogTask, CalendarCategoryId } from '../types/calendar';

interface DraggableBacklogProps {
  tasks: BacklogTask[];
  removeAfterDrop: boolean;
  onToggleRemoveAfterDrop: (value: boolean) => void;
  onAddTask: (task: Omit<BacklogTask, 'id'>) => void;
  onDeleteTask: (taskId: string) => void;
}

export function DraggableBacklog({
  tasks,
  removeAfterDrop,
  onToggleRemoveAfterDrop,
  onAddTask,
  onDeleteTask,
}: DraggableBacklogProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [categoryId, setCategoryId] = useState<CalendarCategoryId>('product');

  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;

    const draggable = new Draggable(containerEl, {
      itemSelector: '.fc-backlog-draggable',
      eventData: (eventEl: HTMLElement) => {
        const taskTitle = eventEl.dataset.title || 'Scheduled Task';
        const mins = Number(eventEl.dataset.duration || '60');
        const catId = (eventEl.dataset.categoryId as CalendarCategoryId) || 'product';
        const color = CATEGORY_MAP[catId]?.color || '#4F46E5';

        return {
          title: taskTitle,
          duration: { minutes: mins },
          backgroundColor: color,
          borderColor: color,
          extendedProps: {
            categoryId: catId,
            backlogTaskId: eventEl.dataset.taskId || '',
            durationMinutes: mins,
          },
        };
      },
    });

    return () => {
      draggable.destroy();
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAddTask({
      title: trimmed,
      durationMinutes,
      categoryId,
    });
    setTitle('');
    setDurationMinutes(60);
    setIsAdding(false);
  };

  return (
    <section aria-label="Draggable backlog tasks">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-tight">
          Draggable Backlog
        </h3>
        <button
          type="button"
          onClick={() => setIsAdding((prev) => !prev)}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600 rounded px-1 py-0.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{isAdding ? 'Close' : 'Add'}</span>
        </button>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
        Drag any item directly onto a day or time slot to schedule it.
      </p>

      {isAdding && (
        <form
          onSubmit={handleSubmit}
          className="mb-3 p-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title..."
            autoFocus
            className="w-full px-2.5 py-1.5 text-xs rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
          />
          <div className="flex items-center gap-2">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value as CalendarCategoryId)}
              aria-label="Task calendar category"
              className="flex-1 px-2 py-1.5 text-xs rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {CALENDAR_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              aria-label="Task duration"
              className="w-20 px-2 py-1.5 text-xs tabular-nums rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value={30}>30m</option>
              <option value={45}>45m</option>
              <option value={60}>1h</option>
              <option value={90}>1.5h</option>
              <option value={120}>2h</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
            >
              Add Task
            </button>
          </div>
        </form>
      )}

      <div ref={containerRef} className="space-y-1.5">
        {tasks.length === 0 ? (
          <div className="py-4 px-3 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            All backlog tasks scheduled.
          </div>
        ) : (
          tasks.map((task) => {
            const category = CATEGORY_MAP[task.categoryId];
            return (
              <div
                key={task.id}
                data-task-id={task.id}
                data-title={task.title}
                data-duration={String(task.durationMinutes)}
                data-category-id={task.categoryId}
                className="fc-backlog-draggable group flex items-center gap-2 px-2.5 py-2 rounded-md bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-grab active:cursor-grabbing transition-colors"
              >
                <GripVertical className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-[2px] shrink-0"
                  style={{ backgroundColor: category.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                    {task.title}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {task.durationMinutes} min · {category.label}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTask(task.id);
                  }}
                  aria-label={`Remove ${task.title}`}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={removeAfterDrop}
          onChange={(e) => onToggleRemoveAfterDrop(e.target.checked)}
          className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
        />
        <span>Remove task after dropping</span>
      </label>
    </section>
  );
}
