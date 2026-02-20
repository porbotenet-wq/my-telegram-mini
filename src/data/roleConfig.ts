// Maps app_role enum values to allowed tab IDs
// If a user has no roles, all tabs are shown (backward compatible)

export const ROLE_TABS: Record<string, string[]> = {
  director: ['card', 'dash', 'floors', 'pf', 'crew', 'sup', 'gpr', 'wflow', 'alerts', 'logs', 'appr', 'sheets', 'docs', 'settings'],
  pm: ['card', 'dash', 'floors', 'pf', 'crew', 'sup', 'gpr', 'wflow', 'alerts', 'logs', 'appr', 'sheets', 'docs', 'settings'],
  project: ['card', 'dash', 'gpr', 'wflow', 'alerts', 'logs', 'appr', 'docs', 'settings'],
  project_opr: ['card', 'dash', 'gpr', 'wflow', 'alerts', 'logs', 'appr', 'docs', 'settings'],
  project_km: ['card', 'dash', 'gpr', 'wflow', 'alerts', 'logs', 'appr', 'docs', 'settings'],
  project_kmd: ['card', 'dash', 'gpr', 'wflow', 'alerts', 'logs', 'appr', 'docs', 'settings'],
  supply: ['card', 'dash', 'sup', 'gpr', 'wflow', 'alerts', 'logs', 'settings'],
  production: ['card', 'dash', 'sup', 'gpr', 'wflow', 'alerts', 'logs', 'settings'],
  foreman1: ['card', 'dash', 'floors', 'pf', 'crew', 'alerts', 'logs', 'settings'],
  foreman2: ['card', 'dash', 'floors', 'pf', 'crew', 'alerts', 'logs', 'settings'],
  foreman3: ['card', 'dash', 'floors', 'pf', 'crew', 'alerts', 'logs', 'settings'],
  pto: ['card', 'dash', 'floors', 'gpr', 'wflow', 'alerts', 'logs', 'appr', 'docs', 'settings'],
  inspector: ['card', 'dash', 'floors', 'pf', 'alerts', 'logs', 'settings'],
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
