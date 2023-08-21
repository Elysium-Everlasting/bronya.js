import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    api: 'src/api.ts',
  },
  external: [/esbuild/],
  format: ['cjs', 'esm'],
  dts: true,
  outDir: 'dist',
})
