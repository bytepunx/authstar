#!/usr/bin/env node
// Builds and pushes one kluster namespace's eight signet bundles for
// scripts/kluster-signet.sh, which runs it: each service's config from
// integration/config/authstar/<service>.yaml and its secrets from
// integration/scripts/lib-secrets.sh, with the namespace's own values
// (S-0575's spec.sh rules):
//   - every *.<default namespace>.svc.cluster.local host names the namespace
//   - dbConnectionString points at <prefix><service> on the shared Postgres
//   - rabbitmqUrl is the namespace's own user on its own vhost ($FLAI_KLUSTER_STATE/amqp-url)
//   - operatorToken is the namespace's own (TOWER_/HERALD_OPERATOR_TOKEN)
//   - EC private keys, dev-placeholder values, and hex secrets are fresh per
//     namespace, generated once and kept in $FLAI_KLUSTER_STATE/signet-secrets.json
//     so a redeploy pushes the same ones
//   - chronicle's clickhouseDatabase is <prefix>chronicle
//
// It pushes through signet's admin GitOpsService.SyncBundle with
// @bytepunx/signet-client, from tower's, keep's, or herald's node_modules,
// because the signet CLI's `bundle push` sends no config_path and so cannot
// write a config. Secrets are SOPS-encrypted to signet's own age key before
// they leave the process; nothing is written to the checkout.
//
// Environment: FLAI_KLUSTER_NAMESPACE, FLAI_KLUSTER_PREFIX, FLAI_KLUSTER_STATE,
// TOWER_OPERATOR_TOKEN, HERALD_OPERATOR_TOKEN, KLUSTER_DEFAULT_NAMESPACE, and,
// unless KLUSTER_DRY_RUN=1, KLUSTER_SIGNET_SERVER and KLUSTER_SIGNET_TOKEN_FILE.
// KLUSTER_DRY_RUN=1 prints each bundle's config and secret names, never a
// secret's value, and pushes nothing.
import { execFileSync } from 'node:child_process'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = process.env

function die(msg) {
  process.stderr.write(`kluster-signet-push.mjs: ${msg}\n`)
  process.exit(1)
}

function need(name) {
  const v = env[name]
  if (v === undefined || v === '') die(`${name} is not set; scripts/kluster-signet.sh sets it`)
  return v
}

const dryRun = env.KLUSTER_DRY_RUN === '1'
const ns = need('FLAI_KLUSTER_NAMESPACE')
const prefix = env.FLAI_KLUSTER_PREFIX ?? die('FLAI_KLUSTER_PREFIX is not set; flai sets it, empty for the default namespace')
const state = need('FLAI_KLUSTER_STATE')
const defaultNs = env.KLUSTER_DEFAULT_NAMESPACE || 'authstar'
const tokens = { tower: need('TOWER_OPERATOR_TOKEN'), herald: need('HERALD_OPERATOR_TOKEN') }
const amqpFile = join(state, 'amqp-url')
if (!existsSync(amqpFile)) die(`${amqpFile} is missing; scripts/kluster-deploy.sh writes it when it makes the namespace's vhost`)
const amqpUrl = readFileSync(amqpFile, 'utf8').trim()

const hostFrom = `.${defaultNs}.svc.cluster.local`
const hostTo = `.${ns}.svc.cluster.local`
const renameHosts = (s) => s.split(hostFrom).join(hostTo)

// The harness's secrets, as lib-secrets.sh holds them: [service, name, value].
function readSecretEntries() {
  const lib = join(root, 'integration/scripts/lib-secrets.sh')
  const dump = `. "$1"
for e in "\${SECRET_ENTRIES[@]}"; do
  svc="\${e%%/*}" name="\${e#*/}"
  var="SECRET_VALUE__\${svc}__\${name}"; var="\${var//-/_}"
  printf '%s\\0%s\\0%s\\0' "$svc" "$name" "\${!var}"
done`
  const out = execFileSync('bash', ['-c', dump, 'lib-secrets', lib], { encoding: 'utf8' })
  const parts = out.split('\0')
  const entries = []
  for (let i = 0; i + 2 < parts.length; i += 3) entries.push([parts[i], parts[i + 1], parts[i + 2]])
  if (entries.length === 0) die(`${lib} listed no SECRET_ENTRIES`)
  return entries
}

// A fresh value of the same kind, or undefined when the value is kept as it is.
function freshValue(value) {
  if (value.startsWith('-----BEGIN EC PRIVATE KEY-----')) {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    return privateKey.export({ type: 'sec1', format: 'pem' }).toString().trimEnd()
  }
  if (value.startsWith('dev-placeholder-')) return `dev-${ns}-${randomBytes(32).toString('base64url')}`
  if (/^[0-9a-f]{32,}$/.test(value)) return randomBytes(value.length / 2).toString('hex')
  return undefined
}

function buildSecrets() {
  const keptFile = join(state, 'signet-secrets.json')
  const kept = existsSync(keptFile) ? JSON.parse(readFileSync(keptFile, 'utf8')) : {}
  const secrets = {}
  for (const [svc, name, value] of readSecretEntries()) {
    secrets[svc] ??= {}
    let v
    if (name === 'dbConnectionString') {
      v = `postgres://postgres:postgres@postgresql.postgres.svc.cluster.local:5432/${prefix}${svc}?sslmode=disable`
    } else if (name === 'rabbitmqUrl') {
      v = amqpUrl
    } else if (name === 'operatorToken') {
      v = tokens[svc] ?? die(`no operator token for ${svc}; only tower and herald have one`)
    } else if (kept[svc]?.[name] !== undefined) {
      v = kept[svc][name]
    } else {
      const fresh = freshValue(value)
      v = renameHosts(fresh ?? value)
      if (fresh !== undefined) {
        kept[svc] ??= {}
        kept[svc][name] = v
      }
    }
    secrets[svc][name] = v
  }
  writeFileSync(keptFile, JSON.stringify(kept, null, 2) + '\n', { mode: 0o600 })
  return secrets
}

function buildConfigs() {
  const dir = join(root, 'integration/config/authstar')
  const configs = {}
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.yaml')).sort()) {
    const svc = basename(f, '.yaml')
    configs[svc] = renameHosts(readFileSync(join(dir, f), 'utf8')).replace(
      /^clickhouseDatabase:[ \t]*chronicle[ \t]*$/m,
      `clickhouseDatabase: ${prefix}chronicle`,
    )
  }
  return configs
}

// A gzipped USTAR archive of the files, as tower's buildSecretArchive builds one.
function tarGz(files) {
  const blocks = []
  for (const [name, content] of files) {
    if (Buffer.byteLength(name) > 99) die(`archive path ${name} is longer than USTAR's 99 bytes`)
    const h = Buffer.alloc(512)
    h.write(name, 0, 'utf8')
    h.write('0000600', 100)
    h.write('0000000', 108)
    h.write('0000000', 116)
    h.write(content.length.toString(8).padStart(11, '0'), 124)
    h.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0'), 136)
    h.write('        ', 148)
    h.write('0', 156)
    h.write('ustar', 257)
    h.write('00', 263)
    let sum = 0
    for (const b of h) sum += b
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
    blocks.push(h, content, Buffer.alloc((512 - (content.length % 512)) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
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

const call = (fn) => new Promise((resolve, reject) => fn((err, res) => (err ? reject(err) : resolve(res))))

async function push(secrets, configs) {
  const { gitOpsClient, encryptForSecret } = await loadClient()
  const token = readFileSync(need('KLUSTER_SIGNET_TOKEN_FILE'), 'utf8').trim()
  const client = gitOpsClient({ address: need('KLUSTER_SIGNET_SERVER'), token })
  let publicKey
  try {
    publicKey = (await call((cb) => client.getSopsPublicKey({}, cb))).publicKey
  } catch (err) {
    if (err.code !== 5) throw err // 5: NOT_FOUND, no SOPS key yet
    publicKey = (await call((cb) => client.rotateSopsKey({}, cb))).newPublicKey
  }
  for (const svc of Object.keys(configs)) {
    // signetd's SyncBundle fails on a bundle with no secrets folder and keeps
    // regular files only, so every bundle carries secrets/.keep, which its
    // walk skips as not .yaml (S-0575, What it took, row 3).
    const files = [['secrets/.keep', Buffer.alloc(0)]]
    for (const [name, value] of Object.entries(secrets[svc] ?? {})) {
      files.push([`secrets/${ns}/${svc}/${name}.yaml`, Buffer.from(await encryptForSecret(publicKey, value))])
    }
    files.push([`config/${ns}/${svc}.yaml`, Buffer.from(configs[svc])])
    const archive = tarGz(files)
    const resp = await new Promise((resolve, reject) => {
      const stream = client.syncBundle((err, res) => (err ? reject(err) : resolve(res)))
      stream.write({ header: { secretsPath: 'secrets/', headSha: '', configPath: 'config/' } })
      for (let i = 0; i < archive.length; i += 64 << 10) stream.write({ data: archive.subarray(i, i + (64 << 10)) })
      stream.end()
    })
    if (resp.errors.length > 0) die(`signet refused part of bundle ${ns}/${svc}: ${resp.errors.join('; ')}`)
    process.stderr.write(
      `kluster-signet-push.mjs: pushed ${ns}/${svc}: ${files.length - 2} secrets (${resp.secretsAdded} added, ${resp.secretsUpdated} updated), config ${resp.configsSynced}\n`,
    )
  }
  client.close()
}

const secrets = buildSecrets()
const configs = buildConfigs()
if (dryRun) {
  for (const svc of Object.keys(configs)) {
    process.stdout.write(`--- bundle ${ns}/${svc}\nsecrets: ${Object.keys(secrets[svc] ?? {}).join(', ') || '(none; secrets/.keep only)'}\nconfig/${ns}/${svc}.yaml:\n${configs[svc]}`)
    process.stdout.write(`+ SyncBundle ${ns}/${svc} to ${env.KLUSTER_SIGNET_SERVER || 'localhost:18444'} (secrets/, config/)\n`)
  }
} else {
  await push(secrets, configs).catch((err) => die(`push to signet failed: ${err.message}; is signet up and its port-forward on ${env.KLUSTER_SIGNET_SERVER}?`))
}
