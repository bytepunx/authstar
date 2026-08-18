import { defineConfig } from 'tsup'

// This is the actual publish build: bundles @bytepunx/authstar-core's compiled source
// directly in (noExternal) so the published package has zero runtime dependency on a
// separately-published core package -- see this repo's README on why. jose/
// fastify-plugin stay real, external dependencies; only our own local-workspace core
// package gets inlined.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { resolve: ['@bytepunx/authstar-core'] },
  sourcemap: true,
  clean: true,
  noExternal: ['@bytepunx/authstar-core'],
})
