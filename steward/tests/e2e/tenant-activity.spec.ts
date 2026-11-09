import { expect, test, type Page } from '@playwright/test'

// Story 004's Activity section on the tenant operator context, against the
// fake tower (tests/helpers/fake-backend-server.ts): `acme` has two seeded
// entries, one with a self-reported `actingAs` label and one without;
// `globex` has none.

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

function activitySection(page: Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: 'Activity', exact: true }) })
}

test.describe('Tenant Activity (Story 004)', () => {
  test('lists the tenant\'s activity, labelling acting-as as self-reported', async ({ page }) => {
    await connectAndOpenTenant(page, 'acme')
    const section = activitySection(page)

    const attributed = section.getByRole('listitem').filter({ hasText: 'account.role-granted' })
    await expect(attributed).toContainText('Recovery grant applied by an operator')
    await expect(attributed).toContainText('acting as jane.operator, self-reported')

    const unattributed = section.getByRole('listitem').filter({ hasText: 'application.created' })
    await expect(unattributed).toContainText("Application 'portal' created")
    await expect(unattributed).not.toContainText('acting as')

    // Newest first, as tower orders the feed.
    await expect(section.getByRole('listitem')).toHaveCount(2)
    await expect(section.getByRole('listitem').first()).toContainText('account.role-granted')
  })

  test('shows the empty state for a tenant with no activity', async ({ page }) => {
    await connectAndOpenTenant(page, 'globex')
    await expect(activitySection(page).getByText('No activity yet.')).toBeVisible()
  })

  test('shows an error when the activity request fails', async ({ page }) => {
    await page.route('**/api/tenants/acme/activity*', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unreachable', message: 'tower unreachable' }),
      }),
    )
    await connectAndOpenTenant(page, 'acme')
    await expect(activitySection(page).getByRole('alert')).toContainText('tower unreachable')
  })

  test('shows a loading state while the activity request is in flight', async ({ page }) => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/tenants/acme/activity*', async (route) => {
      await held
      await route.continue()
    })

    await connectAndOpenTenant(page, 'acme')
    const section = activitySection(page)
    await expect(section.getByText('Loading...')).toBeVisible()

    release()
    await expect(section.getByText('Loading...')).toBeHidden()
    await expect(section.getByRole('listitem').filter({ hasText: 'account.role-granted' })).toBeVisible()
  })
})
