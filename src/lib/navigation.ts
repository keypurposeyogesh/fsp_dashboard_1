import { loginDestination } from './auth-redirect';

export const accountSettingsPath = (role: string | null | undefined) => role === 'admin' || role === 'super_admin' ? '/admin/account' : '/settings';
export const accountNotificationsPath = (role: string | null | undefined) => role === 'admin' || role === 'super_admin' ? '/admin/account/notifications' : '/notifications';

/** Notification payloads may contain administrator-entered links. Keep them internal. */
export function notificationDestination(role: string | null | undefined, raw: unknown): string {
  const fallback=accountNotificationsPath(role);
  if(typeof raw!=='string'||!raw.startsWith('/')||raw.startsWith('//')||/[\\\u0000-\u0020]/.test(raw))return fallback;
  try {
    const path=decodeURIComponent(new URL(raw,'https://local.invalid').pathname);
    if(path.startsWith('//')||/[\\\u0000-\u0020]/.test(path))return fallback;
    const destination=path==='/notifications'?fallback:raw;
    return loginDestination(role,destination);
  }catch{return fallback;}
}
