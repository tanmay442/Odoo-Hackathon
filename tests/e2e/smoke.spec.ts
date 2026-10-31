import { expect, test } from '@playwright/test'

test('home page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Recurring billing that runs itself.' })).toBeVisible()
})

test('get started navigates to sign-in', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Get started' }).first().click()
  await expect(page).toHaveURL(/\/sign-up/)
})
