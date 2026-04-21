// E2E: orders list → order detail
import { test, expect } from '@playwright/test';

test('orders list opens order detail', async ({ page }) => {
  // Stub auth state by setting localStorage before navigating
  await page.addInitScript(() => {
    localStorage.setItem('deliveriq.access', 'fake.token');
    localStorage.setItem('deliveriq.user', JSON.stringify({ id: 'pm1', role: 'PM', email: 'pm1@deliveriq.local' }));
  });
  await page.route('**/v1/orders*', async (route) => {
    if (route.request().method() === 'GET' && route.request().url().includes('/orders/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'ord-1', orderNumber: 'ORD-1', customerName: 'Acme', sos: [],
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'ord-1', orderNumber: 'ORD-1', customerName: 'Acme', contractValue: '1000' }],
          pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
        }),
      });
    }
  });
  await page.goto('/orders');
  await expect(page.getByText('ORD-1')).toBeVisible();
  await page.getByText('ORD-1').click();
  await expect(page).toHaveURL(/\/orders\/ord-1$/);
});
