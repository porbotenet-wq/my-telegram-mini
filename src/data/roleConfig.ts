// Maps app_role enum values to allowed tab IDs
// If a user has no roles, all tabs are shown (backward compatible)

export const ROLE_TABS: Record<string, string[]> = {
  director: ['card', 'dash', 'floors', 'pf', 'crew', 'sup', 'gpr', 'wflow', 'alerts', 'sheets', 'docs'],
  pm: ['card', 'dash', 'floors', 'pf', 'crew', 'sup', 'gpr', 'wflow', 'alerts', 'sheets', 'docs'],
  project: ['card', 'dash', 'gpr', 'wflow', 'alerts', 'docs'],
  supply: ['card', 'dash', 'sup', 'gpr', 'wflow', 'alerts'],
  production: ['card', 'dash', 'sup', 'gpr', 'wflow', 'alerts'],
  foreman1: ['card', 'dash', 'floors', 'pf', 'crew', 'alerts'],
  foreman2: ['card', 'dash', 'floors', 'pf', 'crew', 'alerts'],
  foreman3: ['card', 'dash', 'floors', 'pf', 'crew', 'alerts'],
  pto: ['card', 'dash', 'floors', 'gpr', 'wflow', 'alerts', 'docs'],
  inspector: ['card', 'dash', 'floors', 'pf', 'alerts'],
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
