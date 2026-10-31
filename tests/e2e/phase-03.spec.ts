import { expect, test } from '@playwright/test'

for (const path of [
  '/app/customers',
  '/app/subscriptions',
  '/app/subscriptions-new',
  '/admin/templates',
  '/portal/account',
]) {
  test(`signed-out visitor is sent to sign-in from ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(/\/sign-in/)
  })
}
