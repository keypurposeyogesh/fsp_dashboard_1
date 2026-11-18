import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Live release check blocked: configure ${name} in .env.e2e.local or CI secrets.`);
  return value;
};
type Account = 'MEMBER_A' | 'MEMBER_B' | 'ADMIN' | 'SUPER_ADMIN';
const home = (account: Account) => account === 'ADMIN' ? '/admin' : account === 'SUPER_ADMIN' ? '/super-admin' : '/dashboard';

async function signIn(page: Page, account: Account) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(required(`E2E_${account}_EMAIL`));
  await page.getByLabel('Password', { exact: true }).fill(required(`E2E_${account}_PASSWORD`));
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${home(account)}$`));
  await expect(page.locator('#main-content')).toBeVisible();
}

async function api(account: Account): Promise<SupabaseClient> {
  const client = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: required(`E2E_${account}_EMAIL`), password: required(`E2E_${account}_PASSWORD`),
  });
  expect(error?.message, `${account} login`).toBeUndefined();
  expect(data.user).toBeTruthy();
  const profile = await client.from('users').select('role,is_active').eq('id', data.user!.id).single();
  expect(profile.error).toBeNull();
  expect(profile.data?.is_active).toBe(true);
  expect(profile.data?.role).toBe(account === 'ADMIN' ? 'admin' : account === 'SUPER_ADMIN' ? 'super_admin' : 'member');
  return client;
}

function staticRoutes(dir = 'src/app'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name.includes('[') ? [] : staticRoutes(path);
    if (entry.name !== 'page.tsx') return [];
    const route = relative('src/app', dirname(path)).split(/[\\/]/).filter(part => part && !part.startsWith('(')).join('/');
    return ['/' + route];
  });
}

test.beforeAll(() => {
  for (const account of ['MEMBER_A', 'MEMBER_B', 'ADMIN', 'SUPER_ADMIN']) {
    required(`E2E_${account}_EMAIL`); required(`E2E_${account}_PASSWORD`);
  }
  required('NEXT_PUBLIC_SUPABASE_URL'); required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (process.env.E2E_ALLOW_WRITES !== '1') throw new Error('Live release check blocked: E2E_ALLOW_WRITES=1 is required for dedicated, disposable test fixtures.');
  for (const name of ['E2E_ACTIVE_ENROLLMENT_ID', 'E2E_PENDING_ENROLLMENT_ID', 'E2E_ISOLATION_ENROLLMENT_ID', 'E2E_SIGNUP_EMAIL', 'E2E_SIGNUP_PASSWORD']) required(name);
});

test('real sign-in survives a reload and logout removes access', async ({ page }) => {
  await signIn(page, 'MEMBER_A');
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('button', { name: 'Open account menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await page.getByRole('button', { name: 'Logout Session' }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  const response = await page.request.get('/dashboard', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
});

for (const account of ['MEMBER_A', 'ADMIN', 'SUPER_ADMIN'] as const) {
  test(`${account} authenticated route matrix`, async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, account);
    for (const path of staticRoutes().filter(path => path.startsWith('/admin') || path.startsWith('/super-admin') || ['/dashboard', '/resources', '/tasks', '/courses', '/membership', '/documents', '/application', '/notifications', '/events', '/payments', '/community', '/challenge-community'].includes(path))) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      let redirect: string | undefined;
      if (account === 'MEMBER_A' && (path.startsWith('/super-admin') || path.startsWith('/admin')) && path !== '/admin/unauthorized') redirect = '/admin/unauthorized';
      if (account === 'ADMIN' && path.startsWith('/super-admin')) redirect = '/admin';
      if (account === 'ADMIN' && path === '/admin/members/new') redirect = '/admin';
      if (account !== 'MEMBER_A' && !path.startsWith('/admin') && !path.startsWith('/super-admin')) redirect = home(account);
      if (path === '/admin/dashboard' && account !== 'MEMBER_A') redirect = '/admin';
      if (redirect) {
        expect(response.status(), path).toBe(307);
        expect(new URL(response.headers().location, response.url()).pathname, path).toBe(redirect);
      } else {
        expect(response.status(), path).toBe(200);
      }
    }
  });
}

test('member A cannot directly read member B private rows or reflection RPCs', async () => {
  const a = await api('MEMBER_A'), b = await api('MEMBER_B');
  const bUser = (await b.auth.getUser()).data.user!.id;
  const bMember = await b.from('members').select('id').eq('user_id', bUser).order('created_at').limit(1).single();
  expect(bMember.error).toBeNull();
  const enrollment = required('E2E_ISOLATION_ENROLLMENT_ID');
  const targets: [string, string, string][] = [
    ['users', 'id', bUser], ['members', 'id', String(bMember.data!.id)],
    ['offering_enrollments', 'id', enrollment], ['offering_task_completions', 'enrollment_id', enrollment],
  ];
  for (const [table, column, value] of targets) {
    const own = await b.from(table).select('*').eq(column, value);
    expect(own.error, `${table} positive control`).toBeNull();
    expect(own.data!.length, `${table} must have a B fixture`).toBeGreaterThan(0);
    const foreign = await a.from(table).select('*').eq(column, value);
    expect(foreign.error, `${table} query must succeed, not hide a broken table`).toBeNull();
    expect(foreign.data, `${table} cross-member leak`).toEqual([]);
  }
  const privateHistory = await b.rpc('get_task_reflections', { p_enrollment_id: enrollment });
  expect(privateHistory.error).toBeNull();
  expect(privateHistory.data.some((entry: { shared: boolean }) => !entry.shared)).toBe(true);
  const foreignHistory = await a.rpc('get_task_reflections', { p_enrollment_id: enrollment });
  expect(foreignHistory.error?.code).toBe('42501');
  const rewards = await a.rpc('get_challenge_rewards', { p_enrollment_id: enrollment });
  expect(rewards.error).toBeNull();
  expect(rewards.data).toEqual([]);
});

test('member resources load through real table permissions', async ({ page }) => {
  await signIn(page, 'MEMBER_A');
  await page.goto('/resources');
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await expect(page.locator('#main-content').getByRole('alert')).toHaveCount(0);
  const client = await api('MEMBER_A');
  const result = await client.from('resources').select('id,courses(title)');
  expect(result.error).toBeNull();
});

test('task completion persists after reload and repeat submission cannot award twice', async ({ page }) => {
  const client = await api('MEMBER_A');
  const enrollmentId = required('E2E_ACTIVE_ENROLLMENT_ID');
  const enrollment = await client.from('offering_enrollments').select('offering_id,status').eq('id', enrollmentId).single();
  expect(enrollment.error).toBeNull(); expect(enrollment.data?.status).toBe('active');
  const before = await client.from('offering_task_completions').select('task_id').eq('enrollment_id', enrollmentId);
  expect(before.error).toBeNull();
  const tasks = await client.from('offering_daily_tasks').select('id').eq('offering_id', enrollment.data!.offering_id).order('day_number');
  expect(tasks.error).toBeNull();
  const next = tasks.data!.find(task => !before.data!.some(done => done.task_id === task.id));
  expect(next, 'Fixture needs an unfinished task').toBeTruthy();
  await signIn(page, 'MEMBER_A');
  const card = page.locator(`[data-enrollment-id="${enrollmentId}"]`);
  await card.getByRole('button', { name: 'Mark done', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const explanation = 'I practiced the assigned facilitation exercise and recorded a concrete observation for this release check.';
  await dialog.getByRole('textbox', { name: 'Explain how you completed this task' }).fill(explanation);
  await dialog.getByRole('checkbox').uncheck();
  await dialog.getByRole('button', { name: 'Mark done privately +100 points', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(card.locator('progress')).toHaveAttribute('value', String(before.data!.length + 1));
  const after = await client.from('offering_task_completions').select('task_id').eq('enrollment_id', enrollmentId);
  expect(after.error).toBeNull(); expect(after.data!.length).toBe(before.data!.length + 1);
  const balance = await client.rpc('get_challenge_rewards', { p_enrollment_id: enrollmentId });
  expect(balance.error).toBeNull(); expect(balance.data).toHaveLength(1);
  const repeated = await client.rpc('complete_daily_task', { p_enrollment_id: enrollmentId, p_task_id: next!.id, p_reflection: explanation, p_share: false });
  expect(repeated.error).toBeNull();
  const repeatedBalance = await client.rpc('get_challenge_rewards', { p_enrollment_id: enrollmentId });
  expect(repeatedBalance.error).toBeNull();
  expect(repeatedBalance.data[0].earned_points).toBe(balance.data[0].earned_points);
});

test('admin approves a dedicated member B enrollment and B can read the saved activation', async ({ page }) => {
  const b = await api('MEMBER_B');
  const id = required('E2E_PENDING_ENROLLMENT_ID');
  const before = await b.from('offering_enrollments').select('status').eq('id', id).single();
  expect(before.error).toBeNull(); expect(before.data?.status).toBe('access_requested');
  await signIn(page, 'ADMIN'); await page.goto('/admin/courses');
  const row = page.locator(`[data-enrollment-id="${id}"]`);
  await row.getByRole('button', { name: 'Approve access', exact: true }).click();
  await expect.poll(async () => {
    const result = await b.from('offering_enrollments').select('status').eq('id', id).single();
    expect(result.error).toBeNull(); return result.data?.status;
  }).toBe('active');
});

test('real signup reaches email confirmation or an authenticated dashboard', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Release Test Account');
  await page.getByLabel('Email address').fill(required('E2E_SIGNUP_EMAIL'));
  await page.getByLabel('Password', { exact: true }).fill(required('E2E_SIGNUP_PASSWORD'));
  await page.getByLabel('Confirm password').fill(required('E2E_SIGNUP_PASSWORD'));
  const response = page.waitForResponse(res => res.url().includes('/auth/v1/signup') && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect.poll(async () => (new URL(page.url()).pathname === '/dashboard') || await page.getByRole('status').filter({ hasText: /check your inbox/i }).isVisible()).toBe(true);
});

test('password reset requests reach the real authentication service', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill(required('E2E_MEMBER_A_EMAIL'));
  const response = page.waitForResponse(res => res.url().includes('/auth/v1/recover') && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByRole('status')).toContainText(/reset link/i);
});

test('authenticated dashboard fits phone and tablet widths', async ({ page }) => {
  await signIn(page, 'MEMBER_A');
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(page.locator('#main-content')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});
