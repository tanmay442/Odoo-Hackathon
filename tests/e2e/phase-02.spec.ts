import { expect, test } from '@playwright/test'

for (const path of ['/admin/products', '/admin/plans', '/admin/taxes']) {
  test(`signed-out visitor is sent to sign-in from ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(/\/sign-in/)
  })
}
