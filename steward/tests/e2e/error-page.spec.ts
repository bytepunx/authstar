import { expect, test } from '@playwright/test'

// Steward's root error page (+error.svelte): a plain message and a way
// back, never SvelteKit's default error page. Runs against the real built
// steward server and the fake backend from playwright.config.ts.

const VALID_TOKEN = 'e2e-operator-token'

test.describe('Error page', () => {
  test('a route that does not exist shows a plain message and links back to Connect', async ({ page }) => {
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { name: 'Error 404' })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveText('This page does not exist.')
    await page.getByRole('link', { name: 'Back to Connect' }).click()
    await expect(page).toHaveURL(/\/connect$/)
    await expect(page.getByRole('heading', { name: 'Connect' })).toBeVisible()
  })

  test('a connected operator is linked back to tenants', async ({ page }) => {
    await page.goto('/connect')
    await page.getByLabel('Operator bearer token').fill(VALID_TOKEN)
    await page.getByLabel('Acting as').fill('playwright-test')
    await page.getByRole('button', { name: 'Connect' }).click()
    await expect(page).toHaveURL(/\/tenants$/)

    await page.goto('/no-such-page')
    await expect(page.getByRole('alert')).toHaveText('This page does not exist.')
    await page.getByRole('link', { name: 'Back to tenants' }).click()
    await expect(page).toHaveURL(/\/tenants$/)
  })
})
