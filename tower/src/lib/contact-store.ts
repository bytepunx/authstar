import { createHmac } from 'node:crypto'
import type { Pool } from 'pg'

// Per design/stories/tower/008-contacts-erasure-and-export.md: `contact` is
// the one deliberate exception to this codebase's event-sourced-everything
// convention -- a plain, mutable, *hard-deletable* Postgres row, not a
// consequent actor. Erasure (ADR 0026) needs a real `DELETE`, not a
// tombstone event a `contact.purged` subscriber could still theoretically
// replay PII out of.
//
// `id` is deterministic: `HMAC-SHA256(contactHashPepper, tenant + ':' +
// normalizedEmail)`, one per-tenant secret (`contact-hash-pepper`, provisioned
// by ADR 0067's tenant creation flow and pushed only to tower's own signet
// bundle -- unlike the session/internal/identity-hash-key secrets, this one
// never leaves tower). Lookup is always a direct key computation, never a
// browse/search -- `findByEmail` exists for the single-result contact
// lookup route, not a list endpoint.
export interface Contact {
  id: string
  tenant: string
  email: string
  name: string
}

export interface ContactStore {
  computeId(tenant: string, email: string): string
  findById(id: string): Promise<Contact | null>
  findByEmail(tenant: string, email: string): Promise<Contact | null>
  // Create-or-reuse: used by both `/identities/resolve` (new-account path)
  // and `POST /tenants` (first-admin invite) -- same deterministic id means
  // a second call for the same tenant+email is naturally idempotent.
  upsert(tenant: string, email: string, name?: string): Promise<Contact>
  updateName(id: string, name: string): Promise<Contact | null>
  remove(id: string): Promise<boolean>
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Truncated to 20 bytes (40 hex chars) of the HMAC-SHA256 digest, not the
// full 32 -- `consequent-postgres`'s own `<type>_id_map` table stores
// `aggregate_id` as a fixed `character(42)` column (see
// `create_id_map_table.sql`); a full-length hex digest (64 chars) doesn't
// fit and fails with a real Postgres error ("value too long for type
// character(42)") the moment any actor tries to reference this id --
// `erasureRequest` is `identifiedBy: 'contactId'`, so this id flows
// straight into that actor's own id-map row. Found by actually running the
// integration tier against real Postgres, not anticipated upfront -- see
// TESTING.md. 160 bits of HMAC output remains cryptographically ample for
// this purpose.
export function computeContactId(pepper: string, tenant: string, email: string): string {
  return createHmac('sha256', pepper).update(`${tenant}:${normalizeEmail(email)}`).digest('hex').slice(0, 40)
}

export function createPgContactStore(pool: Pool, pepper: string): ContactStore {
  const computeId = (tenant: string, email: string) => computeContactId(pepper, tenant, email)

  return {
    computeId,

    async findById(id) {
      const result = await pool.query('SELECT id, tenant, email, name FROM contacts WHERE id = $1', [id])
      return result.rows[0] ?? null
    },

    async findByEmail(tenant, email) {
      const id = computeId(tenant, email)
      const result = await pool.query('SELECT id, tenant, email, name FROM contacts WHERE id = $1', [id])
      return result.rows[0] ?? null
    },

    async upsert(tenant, email, name = '') {
      const id = computeId(tenant, email)
      const normalized = normalizeEmail(email)
      const result = await pool.query(
        `INSERT INTO contacts (id, tenant, email, name) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
         RETURNING id, tenant, email, name`,
        [id, tenant, normalized, name],
      )
      return result.rows[0]
    },

    async updateName(id, name) {
      const result = await pool.query(
        'UPDATE contacts SET name = $2 WHERE id = $1 RETURNING id, tenant, email, name',
        [id, name],
      )
      return result.rows[0] ?? null
    },

    async remove(id) {
      const result = await pool.query('DELETE FROM contacts WHERE id = $1', [id])
      return (result.rowCount ?? 0) > 0
    },
  }
}

// In-memory fake for behavior/e2e tests (and `buildApp()`'s own default,
// so existing callers/tests that never mention `contactStore` keep working
// unchanged) -- same interface, a `Map` instead of Postgres.
export function createInMemoryContactStore(pepper = 'test-only-pepper'): ContactStore {
  const byId = new Map<string, Contact>()
  const computeId = (tenant: string, email: string) => computeContactId(pepper, tenant, email)

  return {
    computeId,
    async findById(id) {
      return byId.get(id) ?? null
    },
    async findByEmail(tenant, email) {
      return byId.get(computeId(tenant, email)) ?? null
    },
    async upsert(tenant, email, name = '') {
      const id = computeId(tenant, email)
      const existing = byId.get(id)
      const contact: Contact = existing
        ? { ...existing, email: normalizeEmail(email) }
        : { id, tenant, email: normalizeEmail(email), name }
      byId.set(id, contact)
      return contact
    },
    async updateName(id, name) {
      const existing = byId.get(id)
      if (!existing) return null
      const updated = { ...existing, name }
      byId.set(id, updated)
      return updated
    },
    async remove(id) {
      return byId.delete(id)
    },
  }
}

// Run once at server startup (and by the integration test tier, against
// its own disposable testcontainers Postgres) -- `contact` has no
// consequent-postgres-managed schema since it isn't a consequent actor.
export async function ensureContactsSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      tenant TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT ''
    )
  `)
}
