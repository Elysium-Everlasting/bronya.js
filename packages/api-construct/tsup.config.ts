import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    api: 'src/Api.ts',
  },
  external: [/esbuild/],
  format: ['cjs', 'esm'],
  dts: true,
  outDir: 'dist',
})
