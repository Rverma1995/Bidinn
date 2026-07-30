export const CACHE_TTL = {
  SHORT: 3600, // 1 hour (increased from 1m since invalidation handles updates)
  MEDIUM: 86400, // 1 day
  LONG: 604800, // 1 week
  DAY: 86400, // 1 day
};

export const CACHE_KEYS = {
  DASHBOARD_STATS: 'dashboard:stats',
  LEADS_LIST: 'leads:list',
  USERS_LIST: 'users:list',
  BOOKINGS_LIST: 'bookings:list',
  ACTIVITIES_LIST: 'activities:list',
  CALLS_LIST: 'calls:list',
  NOTIFICATIONS_LIST: 'notifications:list',
  PAYMENTS_LIST: 'payments:list',
  ADMIN_STATS: 'admin:stats',
};
