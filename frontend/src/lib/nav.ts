/** Role-filtered navigation shared by Sidebar and the command palette. */

export const ALL_ROLES = ['admin', 'manager', 'team_lead', 'sales_rep'] as const;

export type AppRole = (typeof ALL_ROLES)[number];

export type NavItem = {
  path: string;
  label: string;
  roles: readonly AppRole[];
};

export const MAIN_NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', roles: ALL_ROLES },
  { path: '/leads', label: 'Leads', roles: ALL_ROLES },
  { path: '/pipeline', label: 'Pipeline', roles: ALL_ROLES },
  { path: '/bookings', label: 'Bookings', roles: ALL_ROLES },
  { path: '/payments', label: 'Payments', roles: ['admin', 'manager', 'team_lead'] },
  { path: '/reports', label: 'Reports', roles: ALL_ROLES },
  { path: '/team', label: 'Team', roles: ['admin', 'manager', 'team_lead'] },
];

export const SETTINGS_NAV_ITEM: NavItem = {
  path: '/settings',
  label: 'Settings',
  roles: ALL_ROLES,
};

function isAppRole(role?: string | null): role is AppRole {
  return ALL_ROLES.includes(role as AppRole);
}

export function getVisibleMainNavItems(role?: string | null): NavItem[] {
  if (!isAppRole(role)) return [];
  return MAIN_NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** Pages a role can jump to — same visibility as Sidebar (main nav + Settings). */
export function getCommandPalettePages(role?: string | null): NavItem[] {
  if (!isAppRole(role)) return [];
  const pages = getVisibleMainNavItems(role);
  if (SETTINGS_NAV_ITEM.roles.includes(role)) {
    pages.push(SETTINGS_NAV_ITEM);
  }
  return pages;
}

export function roleCanAccessPath(role: string | null | undefined, path: string): boolean {
  return getCommandPalettePages(role).some((item) => item.path === path);
}
