import { expect, test } from '@playwright/test'

test('signed-out visitor is sent to sign-in from the staff area', async ({ page }) => {
  await page.goto('/admin/staff')
  await expect(page).toHaveURL(/\/sign-in/)
})

test('signed-out visitor is sent to sign-in from the portal', async ({ page }) => {
  await page.goto('/portal')
  await expect(page).toHaveURL(/\/sign-in/)
})

test('webhook rejects an unsigned delivery', async ({ request }) => {
  const response = await request.post('/api/webhooks/clerk', {
    data: { type: 'user.created', data: { id: 'user_nope' } },
  })
  expect(response.status()).toBe(401)
})
