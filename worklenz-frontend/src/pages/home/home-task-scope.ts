import { getUserSession } from '@/utils/session-helper';

export const HOME_TASKS_ASSIGNED_TO_ME = 0;
export const HOME_TASKS_ASSIGNED_BY_ME = 1;
/** Every task in the current team. Backend accepts this only for the owner and admins. */
export const HOME_TASKS_EVERYONE = 3;

export type HomeTaskScope = 'everyone' | 'to' | 'by';

export function canSeeTeamTasks(): boolean {
  const session = getUserSession();
  return !!(session?.owner || session?.is_admin);
}

export function defaultHomeTasksGroupBy(): number {
  return canSeeTeamTasks() ? HOME_TASKS_EVERYONE : HOME_TASKS_ASSIGNED_TO_ME;
}

export function scopeFromGroup(group: number): HomeTaskScope {
  if (group === HOME_TASKS_EVERYONE) return 'everyone';
  if (group === HOME_TASKS_ASSIGNED_BY_ME) return 'by';
  return 'to';
}

export function groupFromScope(scope: HomeTaskScope): number {
  if (scope === 'everyone') return HOME_TASKS_EVERYONE;
  if (scope === 'by') return HOME_TASKS_ASSIGNED_BY_ME;
  return HOME_TASKS_ASSIGNED_TO_ME;
}
