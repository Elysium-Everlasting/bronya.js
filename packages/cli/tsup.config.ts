import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  bundle: true,
  minify: false,
  format: ['cjs', 'esm'],
  dts: true,
  outDir: 'dist',
})
