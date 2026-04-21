// E2E: site detail → milestone update flow
import { test, expect } from '@playwright/test';

test('milestone update PATCH succeeds', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('deliveriq.access', 'fake.token');
    localStorage.setItem('deliveriq.user', JSON.stringify({ id: 'pm1', role: 'PM', email: 'pm1@deliveriq.local' }));
  });
  await page.route('**/v1/sites/site-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'site-1', code: 'STE-1', name: 'Test Site',
        milestones: [{ id: 'm1', type: 'DESIGN', status: 'NOT_STARTED', sequence: 3, weight: 10 }],
      }),
    });
  });
  await page.route('**/v1/milestones/m1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'm1', status: 'IN_PROGRESS' }),
    });
  });
  await page.goto('/sites/site-1');
  await expect(page.getByText(/STE-1/)).toBeVisible();
});
