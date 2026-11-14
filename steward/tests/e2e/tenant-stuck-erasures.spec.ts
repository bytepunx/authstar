import { expect, test, type Page } from '@playwright/test'

// Story 004's Stuck Erasures section on the tenant operator context, against
// the fake tower (tests/helpers/fake-backend-server.ts). At the section's
// fixed 72-hour threshold, `acme` has one stuck request (contact-acme-1, 120
// hours old, herald outstanding); its 2-hour-old contact-acme-2 is not
// stuck yet. `globex`'s only request is 30 hours old, so it has none.

const VALID_TOKEN = 'e2e-operator-token'

async function connectAndOpenTenant(page: Page, slug: string) {
  await page.goto('/connect')
  await page.getByLabel('Operator bearer token').fill(VALID_TOKEN)
  await page.getByLabel('Acting as').fill('playwright-test')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page).toHaveURL(/\/tenants$/)
  await page.getByRole('link', { name: slug, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/tenants/${slug}$`))
}

function stuckSection(page: Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: 'Stuck Erasures', exact: true }) })
}

test.describe('Tenant Stuck Erasures (Story 004)', () => {
  test('lists the tenant\'s requests stuck for more than 72 hours, with the services outstanding', async ({ page }) => {
    await connectAndOpenTenant(page, 'acme')
    const section = stuckSection(page)

    const row = section.getByRole('row').filter({ hasText: 'contact-acme-1' })
    await expect(row).toBeVisible()
    await expect(row).toContainText('herald')
    await expect(section.getByText('contact-acme-2')).toHaveCount(0)
    // The tenant is the page's context, so the rows carry no tenant column.
    await expect(section.getByRole('columnheader', { name: 'Tenant' })).toHaveCount(0)
  })

  test('shows the empty state for a tenant with nothing stuck', async ({ page }) => {
    await connectAndOpenTenant(page, 'globex')
    const section = stuckSection(page)
    await expect(section.getByText('No stuck erasure requests.')).toBeVisible()
    await expect(section.getByText('contact-globex-1')).toHaveCount(0)
  })

  test('links to the cross-tenant Stuck Erasures view', async ({ page }) => {
    await connectAndOpenTenant(page, 'acme')
    await stuckSection(page).getByRole('link', { name: "See every tenant's stuck erasure requests" }).click()
    await expect(page).toHaveURL(/\/erasure-requests\/stuck$/)
  })

  test('shows an error when the stuck request fails', async ({ page }) => {
    await page.route('**/api/erasure-requests/stuck*', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unreachable', message: 'tower unreachable' }),
      }),
    )
    await connectAndOpenTenant(page, 'acme')
    const section = stuckSection(page)
    await expect(section.getByRole('alert')).toContainText('tower unreachable')
    await expect(section.getByText('No stuck erasure requests.')).toBeVisible()
  })

  test('shows a loading state while the stuck request is in flight', async ({ page }) => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/erasure-requests/stuck*', async (route) => {
      await held
      await route.continue()
    })

    await connectAndOpenTenant(page, 'acme')
    const section = stuckSection(page)
    await expect(section.getByText('Loading...')).toBeVisible()

    release()
    await expect(section.getByText('Loading...')).toBeHidden()
    await expect(section.getByRole('row').filter({ hasText: 'contact-acme-1' })).toBeVisible()
  })
})
