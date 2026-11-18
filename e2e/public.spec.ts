import { test, expect } from '@playwright/test';

test('login hydrates without crashing and supports keyboard navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login');
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await page.getByLabel('Email address').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email address')).not.toBeFocused();
  expect(errors).toEqual([]);
});

test('signup rejects mismatched passwords before contacting auth', async ({ page }) => {
  let signupRequests = 0;
  page.on('request', request => { if (request.url().includes('/auth/v1/signup')) signupRequests++; });
  await page.goto('/signup');
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeEnabled();
  await page.getByLabel('Full name').fill('Browser Test');
  await page.getByLabel('Email address').fill('browser-check@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('ExampleOnly-Password123!');
  await page.getByLabel('Confirm password').fill('Different-Password123!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /match/i })).toBeVisible();
  expect(signupRequests).toBe(0);
});

test('forgot password is reachable without sending email', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
});

test('a missing recovery session has an actionable error', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('alert').filter({ hasText: /valid recovery link/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Forgot password' })).toBeVisible();
});

test('anonymous redirects preserve protected return paths', async ({ request }) => {
  for (const path of ['/dashboard', '/resources', '/tasks', '/admin/resources', '/super-admin/users']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    const target = new URL(response.headers().location, 'http://localhost');
    expect(target.pathname).toBe('/login');
    expect(target.searchParams.get('redirect')).toBe(path);
  }
});

test('anonymous API requests cannot write accounts or activity', async ({ request }) => {
  for (const path of ['/api/admin/members', '/api/auth/sync', '/api/activity']) {
    const response = await request.post(path, { data: { action: 'RESOURCE_VIEW', details: {} } });
    expect(response.status(), path).toBe(401);
  }
});

test('legacy admin login returns to shared sign-in', async ({ page }) => {
  await page.goto('/login/admin?redirect=%2Fadmin%2Fresources');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin%2Fresources$/);
  await expect(page.getByLabel('Email address')).toBeVisible();
});

test('public forms fit the viewport without horizontal scrolling', async ({ page }) => {
  for (const path of ['/login', '/signup', '/forgot-password', '/reset-password']) {
    await page.goto(path);
    await expect(page.locator('body')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), path).toBe(true);
  }
});

test('temporary authentication failure offers a retry without navigating repeatedly', async ({ page }) => {
  let navigations = 0;
  // Next also emits same-document history updates during hydration. Count
  // actual document requests, which are what a redirect loop would repeat.
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++; });
  await page.goto('/login?error=auth_unavailable&redirect=%2Fdashboard');
  await expect(page.getByRole('alert').filter({ hasText: /temporarily unavailable/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/error=auth_unavailable/);
  expect(navigations).toBe(1);
});

test('missing public pages render a real 404', async ({ page }) => {
  const response = await page.goto('/login/this-page-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByText(/this page could not be found/i)).toBeVisible();
});
