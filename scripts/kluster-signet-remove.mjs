#!/usr/bin/env node
// Deletes one kluster namespace's signet bundles for scripts/kluster-teardown.sh,
// which runs it: for each service with a config in integration/config/authstar,
// its config and every secret integration/scripts/lib-secrets.sh lists for it,
// under signet namespace $FLAI_KLUSTER_NAMESPACE. Those are what
// scripts/kluster-signet-push.mjs pushes. A config or secret already gone is
// passed over, so a second run passes.
//
// It deletes through signet's AdminService DeleteConfig and DeleteSecret with
// @bytepunx/signet-client, from tower's, keep's, or herald's node_modules,
// because the signet CLI cannot delete a bundle. signet has no RPC an admin
// token can list a namespace's secrets with, so a secret a service wrote into
// the namespace at runtime under a name lib-secrets.sh does not list stays.
//
// Environment: FLAI_KLUSTER_NAMESPACE, FLAI_KLUSTER_PREFIX, KLUSTER_DEFAULT_NAMESPACE,
// and, unless KLUSTER_DRY_RUN=1, KLUSTER_SIGNET_SERVER and KLUSTER_SIGNET_TOKEN_FILE.
// It refuses the default namespace and an empty prefix: a teardown never
// deletes main's bundles. KLUSTER_DRY_RUN=1 prints each delete by name and
// connects to nothing.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = process.env

function die(msg) {
  process.stderr.write(`kluster-signet-remove.mjs: ${msg}\n`)
  process.exit(1)
}

function need(name) {
  const v = env[name]
  if (v === undefined || v === '') die(`${name} is not set; scripts/kluster-teardown.sh sets it`)
  return v
}

const dryRun = env.KLUSTER_DRY_RUN === '1'
const ns = need('FLAI_KLUSTER_NAMESPACE')
const defaultNs = env.KLUSTER_DEFAULT_NAMESPACE || 'authstar'
if (ns === defaultNs) die(`refusing to delete the bundles of the default namespace ${defaultNs}: they hold main's deploy`)
if (!env.FLAI_KLUSTER_PREFIX) die(`refusing namespace ${ns} with an empty FLAI_KLUSTER_PREFIX: only the default namespace has none`)

// The services the push writes a bundle for: one per config file.
function services() {
  const dir = join(root, 'integration/config/authstar')
  return readdirSync(dir)
    .filter((n) => n.endsWith('.yaml'))
    .sort()
    .map((n) => basename(n, '.yaml'))
}

// The secret names lib-secrets.sh lists, by service; never their values.
function secretNames() {
  const lib = join(root, 'integration/scripts/lib-secrets.sh')
  const dump = `. "$1"
for e in "\${SECRET_ENTRIES[@]}"; do
  printf '%s\\0%s\\0' "\${e%%/*}" "\${e#*/}"
done`
  const parts = execFileSync('bash', ['-c', dump, 'lib-secrets', lib], { encoding: 'utf8' }).split('\0')
  const names = {}
  for (let i = 0; i + 1 < parts.length; i += 2) (names[parts[i]] ??= []).push(parts[i + 1])
  if (Object.keys(names).length === 0) die(`${lib} listed no SECRET_ENTRIES`)
  return names
}

async function loadClient() {
  for (const p of ['tower', 'keep', 'herald']) {
    try {
      const resolved = createRequire(join(root, p, 'package.json')).resolve('@bytepunx/signet-client')
      return await import(pathToFileURL(resolved).href)
    } catch {
      // not installed under this project; try the next
    }
  }
  return die('@bytepunx/signet-client is not installed under tower, keep, or herald; run make install in this checkout')
}

const NOT_FOUND = 5

// del runs one delete and answers true when it deleted, false when it was gone already.
const del = (fn) =>
  new Promise((resolve, reject) =>
    fn((err) => {
      if (!err) resolve(true)
      else if (err.code === NOT_FOUND) resolve(false)
      else reject(err)
    }),
  )

async function remove(plan) {
  const { dialAdmin } = await loadClient()
  const token = readFileSync(need('KLUSTER_SIGNET_TOKEN_FILE'), 'utf8').trim()
  const client = dialAdmin({ address: need('KLUSTER_SIGNET_SERVER'), token })
  try {
    for (const [svc, names] of plan) {
      let deleted = 0
      let gone = 0
      for (const secretName of names) {
        const where = `secret ${ns}/${svc}/${secretName}`
        const ok = await del((cb) => client.deleteSecret({ namespace: ns, service: svc, secretName }, cb)).catch((err) =>
          die(`could not delete ${where}: ${err.message}`),
        )
        ok ? deleted++ : gone++
      }
      const config = await del((cb) => client.deleteConfig({ namespace: ns, service: svc }, cb)).catch((err) =>
        die(`could not delete config ${ns}/${svc}: ${err.message}`),
      )
      process.stderr.write(
        `kluster-signet-remove.mjs: removed ${ns}/${svc}: ${deleted} secrets deleted, ${gone} already gone; config ${config ? 'deleted' : 'already gone'}\n`,
      )
    }
  } finally {
    client.close()
  }
}

const names = secretNames()
const plan = services().map((svc) => [svc, names[svc] ?? []])
if (dryRun) {
  for (const [svc, secrets] of plan) {
    for (const s of secrets) process.stdout.write(`+ DeleteSecret ${ns}/${svc}/${s}\n`)
    process.stdout.write(`+ DeleteConfig ${ns}/${svc} on ${env.KLUSTER_SIGNET_SERVER || 'localhost:18444'}\n`)
  }
} else {
  await remove(plan).catch((err) => die(`delete from signet failed: ${err.message}; is signet up and its port-forward on ${env.KLUSTER_SIGNET_SERVER}?`))
}
