// Maps app_role enum values to allowed tab IDs
// If a user has no roles, all tabs are shown (backward compatible)

export const ROLE_TABS: Record<string, string[]> = {
  director: ['card', 'dash', 'floors', 'pf', 'crew', 'sup', 'gpr', 'wflow', 'alerts', 'logs', 'appr', 'sheets', 'docs'],
  pm: ['card', 'dash', 'floors', 'pf', 'crew', 'sup', 'gpr', 'wflow', 'alerts', 'logs', 'appr', 'sheets', 'docs'],
  project: ['card', 'dash', 'gpr', 'wflow', 'alerts', 'logs', 'appr', 'docs'],
  supply: ['card', 'dash', 'sup', 'gpr', 'wflow', 'alerts', 'logs'],
  production: ['card', 'dash', 'sup', 'gpr', 'wflow', 'alerts', 'logs'],
  foreman1: ['card', 'dash', 'floors', 'pf', 'crew', 'alerts', 'logs'],
  foreman2: ['card', 'dash', 'floors', 'pf', 'crew', 'alerts', 'logs'],
  foreman3: ['card', 'dash', 'floors', 'pf', 'crew', 'alerts', 'logs'],
  pto: ['card', 'dash', 'floors', 'gpr', 'wflow', 'alerts', 'logs', 'appr', 'docs'],
  inspector: ['card', 'dash', 'floors', 'pf', 'alerts', 'logs'],
};

export function getAllowedTabs(roles: string[]): string[] | null {
  if (!roles || roles.length === 0) return null; // null = show all
  const allowed = new Set<string>();
  roles.forEach(role => {
    const tabs = ROLE_TABS[role];
    if (tabs) tabs.forEach(t => allowed.add(t));
  });
  return allowed.size > 0 ? Array.from(allowed) : null;
}
