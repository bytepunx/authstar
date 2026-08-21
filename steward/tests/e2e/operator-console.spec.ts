import { expect, test } from '@playwright/test'

// Full-flow e2e (Playwright, real browser, real steward server, backend
// faked by a real HTTP process -- see playwright.config.ts's `webServer`
// array and tests/e2e/run-fake-backend.ts). Mirrors the coherent slice this
// pilot went deep on: connect -> search/reactivate -> create -> tenant
// context (Admin Access) -> rotate keys.

const VALID_TOKEN = 'e2e-operator-token'

test.describe('Connect (Story 001)', () => {
  test('lands on Connect when nothing is connected yet', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/connect$/)
    await expect(page.getByRole('heading', { name: 'Connect' })).toBeVisible()
  })

  test('rejects an invalid token with a distinct message', async ({ page }) => {
    await page.goto('/connect')
    await page.getByLabel('Operator bearer token').fill('not-a-real-token')
    await page.getByLabel('Acting as').fill('playwright-test')
    await page.getByRole('button', { name: 'Connect' }).click()
    await expect(page.getByRole('alert')).toContainText('rejected')
  })

  test('connects with a valid token and required acting-as label, then lands on Tenant Search', async ({ page }) => {
    await page.goto('/connect')
    await page.getByLabel('Operator bearer token').fill(VALID_TOKEN)
    await page.getByLabel('Acting as').fill('playwright-test')
    await page.getByRole('button', { name: 'Connect' }).click()
    await expect(page).toHaveURL(/\/tenants$/)
    await expect(page.getByText('acting as: playwright-test')).toBeVisible()
  })

  test('the "acting as" field is required -- submit stays disabled without it', async ({ page }) => {
    await page.goto('/connect')
    await page.getByLabel('Operator bearer token').fill(VALID_TOKEN)
    await expect(page.getByRole('button', { name: 'Connect' })).toBeDisabled()
  })
})

test.describe('Tenant Search and Creation (Story 002)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/connect')
    await page.getByLabel('Operator bearer token').fill(VALID_TOKEN)
    await page.getByLabel('Acting as').fill('playwright-test')
    await page.getByRole('button', { name: 'Connect' }).click()
    await expect(page).toHaveURL(/\/tenants$/)
  })

  test('searches for a tenant by slug', async ({ page }) => {
    await page.getByPlaceholder('search by slug or name').fill('acme')
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page.getByRole('cell', { name: 'acme', exact: true })).toBeVisible()
  })

  test('reactivates a suspended tenant inline from search results', async ({ page }) => {
    await page.getByPlaceholder('search by slug or name').fill('globex')
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page.getByRole('row', { name: /globex/ })).toContainText('suspended')
    await page.getByRole('button', { name: 'Reactivate' }).click()
    await expect(page.getByRole('row', { name: /globex/ })).toContainText('active')
  })

  test('creates a tenant and shows the retry-same-slug guidance on a duplicate', async ({ page }) => {
    const slug = `e2e-${Date.now()}`
    await page.getByRole('button', { name: 'Create Tenant' }).click()
    await page.locator('label', { hasText: 'Slug' }).locator('input').fill(slug)
    await page.locator('label', { hasText: 'Name' }).locator('input').fill('E2E Co')
    await page.locator('label', { hasText: 'Domain' }).locator('input').fill(`${slug}.test`)
    await page.locator('label', { hasText: 'Admin email' }).locator('input').fill('admin@e2e.test')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.getByText(`Tenant ${slug} created`)).toBeVisible()
    // ADR 0091: adminHost is now authstar.<domain>, not admin.<slug>.<baseDomain>.
    await expect(page.getByText(`authstar.${slug}.test`)).toBeVisible()

    // Retry the exact same slug -- expected to surface a clear "retry is
    // correct" message per tower Story 012, not "try a different slug".
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(`same slug "${slug}"`)
  })

  // ADR 0091: a *different* slug but a domain already claimed by another
  // tenant is a distinct failure from the same-slug retry above -- "try
  // the same slug again" would never help here, a different domain is
  // needed. Regression test for a real bug found while building this: the
  // 409 handler originally treated every 409 as a domain conflict, which
  // broke the same-slug-retry guidance above.
  test('rejects a domain already claimed by another tenant, with actionable guidance', async ({ page }) => {
    const domain = `dup-${Date.now()}.test`
    await page.getByRole('button', { name: 'Create Tenant' }).click()
    await page.locator('label', { hasText: 'Slug' }).locator('input').fill(`first-${Date.now()}`)
    await page.locator('label', { hasText: 'Name' }).locator('input').fill('First Co')
    await page.locator('label', { hasText: 'Domain' }).locator('input').fill(domain)
    await page.locator('label', { hasText: 'Admin email' }).locator('input').fill('admin@first.test')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.getByText('created', { exact: false })).toBeVisible()

    await page.locator('label', { hasText: 'Slug' }).locator('input').fill(`second-${Date.now()}`)
    await page.locator('label', { hasText: 'Name' }).locator('input').fill('Second Co')
    // Domain field keeps its previous value -- fill explicitly anyway to
    // make the duplicate deliberate, not incidental.
    await page.locator('label', { hasText: 'Domain' }).locator('input').fill(domain)
    await page.locator('label', { hasText: 'Admin email' }).locator('input').fill('admin@second.test')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(`Domain "${domain}" is already registered`)
    await expect(page.getByRole('alert')).toContainText('Choose a different domain')
  })
})

test.describe('Tenant Operator Context (Story 003 Admin Access, Story 005 Rotate Keys)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/connect')
    await page.getByLabel('Operator bearer token').fill(VALID_TOKEN)
    await page.getByLabel('Acting as').fill('playwright-test')
    await page.getByRole('button', { name: 'Connect' }).click()
    await page.getByRole('link', { name: 'acme' }).click()
    await expect(page).toHaveURL(/\/tenants\/acme$/)
  })

  test('shows existing permission holders', async ({ page }) => {
    await expect(page.getByText('admin@acme.test')).toBeVisible()
    await expect(page.getByText('tenant:manage')).toBeVisible()
  })

  // ADR 0091: the tenant's admin console URL, derived from its domain --
  // fake backend seeds acme with domain "acme.test".
  test('shows the tenant\'s admin console URL, linking to authstar.<domain>', async ({ page }) => {
    const link = page.getByRole('link', { name: 'authstar.acme.test' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', 'https://authstar.acme.test')
    await expect(link).toHaveAttribute('target', '_blank')
  })

  // ADR 0091: inviting a brand-new admin by email, distinct from the
  // existing-account grant/revoke recovery flow above.
  test('invites a new admin by email', async ({ page }) => {
    await page.getByPlaceholder("new admin's email").fill('new-admin@acme.test')
    await page.getByRole('button', { name: 'Send invite' }).click()
    await expect(page.getByText('Invite sent to new-admin@acme.test')).toBeVisible()
  })

  // authstar-steward#1: role definition management.
  test('creates and retires a role definition', async ({ page }) => {
    await expect(page.getByText('No role definitions yet.')).toBeVisible()

    await page.getByPlaceholder('role name, e.g. plan:family').fill('plan:family')
    await page.getByPlaceholder('application slug (blank = tenant-wide)').fill('loci')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(page.getByText('loci: plan:family')).toBeVisible()
    await expect(page.getByText('(active)')).toBeVisible()

    await page.getByRole('button', { name: 'Retire' }).click()
    await expect(page.getByText('(retired)')).toBeVisible()
  })

  test('grants a permission to an account found by email search', async ({ page }) => {
    await page.getByPlaceholder('account email').fill('nobody@acme.test')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByText('nobody@acme.test')).toBeVisible()

    await page.getByPlaceholder('grant, e.g. tenant:manage').fill('billing:read')
    await page.getByRole('button', { name: 'Grant' }).click()

    // Reflected back in "current permission holders" after the grant.
    await expect(page.getByText('billing:read')).toBeVisible()
  })

  test('rotating keys requires a heavy, typed confirmation before submitting', async ({ page }) => {
    await page.getByLabel('session').check()
    await page.getByLabel('identity-hash').check()
    await page.getByRole('button', { name: 'Rotate selected keys' }).click()

    const dialog = page.getByRole('dialog', { name: 'Confirm key rotation' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('un-refreshed browser session')
    await expect(dialog).toContainText('not an immediate cutover')

    const confirmButton = dialog.getByRole('button', { name: /Confirm rotation/ })
    await expect(confirmButton).toBeDisabled()

    await dialog.getByPlaceholder('acme').fill('acme')
    await expect(confirmButton).toBeEnabled()
    await confirmButton.click()

    await expect(page.getByText(/Rotated: session, identity-hash/)).toBeVisible()
  })
})
