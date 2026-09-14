import { test, expect } from '@playwright/test';
// One smoke test per role — asserts the landing routes each role to the right surface.
// Run a single role:  npx playwright test --project=student

test.describe('student', () => {
  test.use({ storageState: 'e2e/.auth/student.json' });
  test('lands on the consent gate or the exam room', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/ยืนยันสมัครสอบ|ห้องสอบของฉัน|ยินดีต้อนรับ/)).toBeVisible();
    // never a staff-only surface
    await expect(page.getByText('จัดการบัญชีผู้ใช้')).toHaveCount(0);
  });
});

test.describe('writer', () => {
  test.use({ storageState: 'e2e/.auth/writer.json' });
  test('can reach คลังข้อสอบของฉัน and NOT the shared bank', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('คลังข้อสอบของฉัน').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'คลัง MCQ' })).toHaveCount(0);
    await expect(page.getByText('จัดการบัญชีผู้ใช้')).toHaveCount(0);
  });
});

test.describe('admin', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });
  test('sees admin management entries', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/จัดการบัญชีผู้ใช้|จัดการสิทธิ์/).first()).toBeVisible();
  });
});
