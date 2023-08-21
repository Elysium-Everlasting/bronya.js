import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    utils: 'src/utils/index.ts',
  },
  external: [/esbuild/],
  format: ['cjs', 'esm'],
  dts: true,
  outDir: 'dist',
})
