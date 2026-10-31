import { expect, test } from '@playwright/test'

test('home page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Destr' })).toBeVisible()
})

test('get started navigates to sign-in', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Get started' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
})
