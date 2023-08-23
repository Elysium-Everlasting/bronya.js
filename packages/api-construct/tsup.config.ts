import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'plugins/cli': 'src/plugins/cli/index.ts',
    'integrations/express': 'src/integrations/express/index.ts',
    'integrations/lambda': 'src/integrations/lambda/index.ts',
  },
  external: [/esbuild/],
  format: ['cjs', 'esm'],
  dts: true,
  outDir: 'dist',
})
