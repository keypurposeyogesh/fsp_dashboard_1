/** Navigation only. Proxy and database policies still enforce access. */
export function authServiceUnavailable(error: { status?: number; name?: string } | null): boolean {
  return Boolean(error && (error.status === 0 || (error.status ?? 0) >= 500 || error.name === 'AuthRetryableFetchError'));
}

const ADMIN_SECTIONS = [
  '/admin/members', '/admin/applications', '/admin/documents', '/admin/payments',
  '/admin/courses', '/admin/memberships', '/admin/task-progress',
  '/admin/challenge-community', '/admin/updates', '/admin/events', '/admin/tasks',
  '/admin/resources', '/admin/fees', '/admin/community', '/admin/notifications',
  '/admin/reports', '/admin/audit-logs', '/admin/member-logs', '/admin/settings', '/admin/account',
];

/** Shared by the server gate and post-login navigation. Account creation stays super-admin only. */
export function adminRouteAllowed(path: string): boolean {
  if (path === '/admin/members/new' || path.startsWith('/admin/members/new/')) return false;
  return path === '/admin' || path === '/admin/dashboard'
    || ADMIN_SECTIONS.some(section => path === section || path.startsWith(section + '/'));
}

export function roleHome(role: string | null | undefined): string {
  if (role === 'super_admin') return '/super-admin';
  if (role === 'admin') return '/admin';
  return '/dashboard';
}

export function loginDestination(role: string | null | undefined, requested = ''): string {
  const home = roleHome(role);
  if (!requested.startsWith('/') || requested.startsWith('//') || /[\\\u0000-\u0020]/.test(requested)) return home;
  try {
    const url = new URL(requested, 'https://local.invalid');
    const path = decodeURIComponent(url.pathname);
    if (url.origin !== 'https://local.invalid' || /[\\\u0000-\u0020]/.test(path) || path.startsWith('//')) return home;
    const within = (prefix: string) => path === prefix || path.startsWith(prefix + '/');
    if (path === '/' || path === '/dashboard' || ['/login','/signup','/auth','/api','/_next','/forgot-password','/reset-password','/organizations'].some(within)) return home;
    if (role === 'super_admin') return within('/admin') || within('/super-admin') ? requested : home;
    if (role === 'admin') {
      return adminRouteAllowed(path) ? requested : home;
    }
    return within('/admin') || within('/super-admin') ? home : requested;
  } catch { return home; }
}
