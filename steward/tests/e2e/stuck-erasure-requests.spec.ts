import { expect, test, type Page } from '@playwright/test'

// Story 004's top-level Stuck Erasures view, against the fake tower
// (tests/helpers/fake-backend-server.ts), whose seeds are aged so that:
// at 72 hours only acme's contact-acme-1 (120h, herald outstanding) is
// stuck; at 24 hours globex's contact-globex-1 (30h, keep) is too; and
// under 2 hours acme's contact-acme-2 (2h, herald and keep) joins them.

const VALID_TOKEN = 'e2e-operator-token'

async function connectAndOpenStuck(page: Page) {
  await page.goto('/connect')
  await page.getByLabel('Operator bearer token').fill(VALID_TOKEN)
  await page.getByLabel('Acting as').fill('playwright-test')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page).toHaveURL(/\/tenants$/)
  await page.getByRole('navigation').getByRole('link', { name: 'Stuck erasures' }).click()
  await expect(page).toHaveURL(/\/erasure-requests\/stuck$/)
}

function serviceGroup(page: Page, service: string) {
  return page.locator('section.service-group', { has: page.getByRole('heading', { name: service, exact: true }) })
}

async function setThreshold(page: Page, hours: string) {
  await page.getByLabel('Older than (hours)').fill(hours)
  await page.getByRole('button', { name: 'Apply' }).click()
}

test.describe('Stuck Erasure Requests (Story 004)', () => {
  test('is reached from the header and lists requests older than 72 hours by default', async ({ page }) => {
    await connectAndOpenStuck(page)

    await expect(page.getByLabel('Older than (hours)')).toHaveValue('72')
    await expect(page.locator('section.service-group')).toHaveCount(1)

    const herald = serviceGroup(page, 'herald')
    const rows = herald.getByRole('row').filter({ hasText: 'contact-' })
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('acme')
    await expect(rows.first()).toContainText('contact-acme-1')
    await expect(page.getByText('contact-globex-1')).toHaveCount(0)
  })

  test('re-queries tower when the threshold changes', async ({ page }) => {
    await connectAndOpenStuck(page)

    await setThreshold(page, '24')
    const keep = serviceGroup(page, 'keep')
    await expect(keep.getByRole('row').filter({ hasText: 'contact-globex-1' })).toContainText('globex')
    await expect(serviceGroup(page, 'herald').getByRole('row').filter({ hasText: 'contact-' })).toHaveCount(1)
  })

  test('lists a request under each service still outstanding', async ({ page }) => {
    await connectAndOpenStuck(page)

    await setThreshold(page, '1')
    const herald = serviceGroup(page, 'herald')
    const keep = serviceGroup(page, 'keep')
    await expect(herald.getByRole('row').filter({ hasText: 'contact-acme-2' })).toContainText('herald, keep')
    await expect(keep.getByRole('row').filter({ hasText: 'contact-acme-2' })).toContainText('herald, keep')
    await expect(herald.getByRole('row').filter({ hasText: 'contact-' })).toHaveCount(2)
    await expect(keep.getByRole('row').filter({ hasText: 'contact-' })).toHaveCount(2)
  })

  test('links each tenant to its operator page', async ({ page }) => {
    await connectAndOpenStuck(page)
    await serviceGroup(page, 'herald').getByRole('link', { name: 'acme', exact: true }).click()
    await expect(page).toHaveURL(/\/tenants\/acme$/)
  })

  test('shows the empty state when nothing is older than the threshold', async ({ page }) => {
    await connectAndOpenStuck(page)
    await setThreshold(page, '1000')
    await expect(page.getByText('No stuck erasure requests.')).toBeVisible()
    await expect(page.locator('section.service-group')).toHaveCount(0)
  })

  test('refuses a threshold that is not a positive whole number without calling tower', async ({ page }) => {
    let called = false
    await connectAndOpenStuck(page)
    await page.route('**/api/erasure-requests/stuck*', (route) => {
      called = true
      return route.continue()
    })
    await setThreshold(page, '0')
    await expect(page.getByRole('alert')).toContainText('Enter a positive whole number of hours.')
    expect(called).toBe(false)
  })

  test('shows an error when the stuck request fails', async ({ page }) => {
    await page.route('**/api/erasure-requests/stuck*', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unreachable', message: 'tower unreachable' }),
      }),
    )
    await connectAndOpenStuck(page)
    await expect(page.getByRole('alert')).toContainText('tower unreachable')
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

    await connectAndOpenStuck(page)
    await expect(page.getByText('Loading...')).toBeVisible()

    release()
    await expect(page.getByText('Loading...')).toBeHidden()
    await expect(serviceGroup(page, 'herald').getByRole('row').filter({ hasText: 'contact-acme-1' })).toBeVisible()
  })
})
