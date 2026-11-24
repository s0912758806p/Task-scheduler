// Small helpers over uiSlice filters shared by the board's top bar, stats strip and columns.
import type { TaskFilters } from '@/lib/taskQueries';

/** True when any filter (chip, search, priority, due range, tags) narrows the board. */
export function hasActiveFilters(f: TaskFilters): boolean {
  return f.chip !== null || f.search.trim() !== '' || f.priority !== null || f.dueRange !== 'all' || f.tags.length > 0;
}

/** How many of the popover's filters (priority, due range, tags, search) are set. */
export function popoverFilterCount(f: TaskFilters): number {
  return [f.priority !== null, f.dueRange !== 'all', f.tags.length > 0, f.search.trim() !== ''].filter(Boolean).length;
}
