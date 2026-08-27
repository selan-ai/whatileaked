import { defineConfig } from 'tsup'

// node20, not node24: the published bundle is plain JavaScript, so a user needs
// only a Node new enough to run it. Node 24 is a *contributor* requirement —
// `node --test` reads the TypeScript sources directly via native type stripping.
export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
})
