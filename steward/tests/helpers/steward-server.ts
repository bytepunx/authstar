// Spawns the real, built steward server (adapter-node's `build/index.js`)
// as a child process -- used by the integration tier (real HTTP, no
// browser) and available to the e2e tier too if a test wants the exact same
// production build rather than `vite dev`. Requires `npm run build` to have
// already produced `build/` (wired as `pretest:integration`, matching
// tower's own `pretest: npm run build` convention).

import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')

export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        reject(new Error('could not determine free port'))
      }
    })
  })
}

export interface RunningStewardServer {
  url: string
  process: ChildProcess
  stop: () => Promise<void>
}

export async function startStewardServer(env: Record<string, string>): Promise<RunningStewardServer> {
  const port = await getFreePort()
  const child = spawn(process.execPath, [path.join(repoRoot, 'build', 'index.js')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
      HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString()
  })

  const url = `http://127.0.0.1:${port}`

  // Poll until the server actually accepts connections, rather than a fixed
  // sleep -- build/start time varies by machine.
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      await fetch(url + '/connect')
      return {
        url,
        process: child,
        stop: () =>
          new Promise<void>((resolve) => {
            child.once('exit', () => resolve())
            child.kill()
          }),
      }
    } catch {
      if (child.exitCode !== null) {
        throw new Error(`steward server exited early (code ${child.exitCode}): ${stderr}`)
      }
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  child.kill()
  throw new Error(`steward server did not become ready in time: ${stderr}`)
}
