import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    api: 'src/cdk/constructs/Api/index.ts',
  },
  external: [/esbuild/],
  format: ['cjs', 'esm'],
  dts: true,
  outDir: 'dist',
})
