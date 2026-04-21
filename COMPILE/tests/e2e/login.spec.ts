// E2E: login → dashboard
// All API calls are intercepted via page.route() — these specs do NOT require a backend.

import { test, expect } from '@playwright/test';

test.describe('Login → Dashboard', () => {
  test('valid credentials lead to /dashboard with KPI tiles', async ({ page }) => {
    await page.route('**/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'fake.access.token',
          refreshToken: 'fake.refresh.token',
          expiresIn: 900,
          user: { id: 'u1', email: 'bod@deliveriq.local', fullName: 'BOD User', role: 'BOD', departmentId: null, locale: 'id-ID' },
        }),
      });
    });

    await page.route('**/v1/reports/bod', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalRevenue: '1500000000.00',
          revenueAtRisk: '200000000.00',
          onTrackPercent: 78.5,
          capexConsumedPercent: 0,
          rfsMonthPlan: 12,
          rfsMonthActual: 9,
          overdueCount: 3,
          statusDistribution: { onTrack: 18, atRisk: 4, delay: 3 },
          departments: [],
          generatedAt: new Date().toISOString(),
          cacheStatus: 'MISS',
        }),
      });
    });

    await page.goto('/login');
    await page.getByLabel(/email/i).fill('bod@deliveriq.local');
    await page.getByLabel(/password/i).fill('Passw0rd!');
    await page.getByRole('button', { name: /sign in|log in|masuk/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/total revenue|total pendapatan/i)).toBeVisible();
  });

  test('invalid credentials show error', async ({ page }) => {
    await page.route('**/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAUTHENTICATED', detail: 'Invalid credentials' }),
      });
    });
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('bod@deliveriq.local');
    await page.getByLabel(/password/i).fill('wrong');
    await page.getByRole('button', { name: /sign in|log in|masuk/i }).click();
    await expect(page.getByText(/invalid credentials|kredensial tidak valid/i)).toBeVisible();
  });
});
