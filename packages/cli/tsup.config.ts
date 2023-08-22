import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  bundle: true,
  dts: true,
  format: ['cjs', 'esm'],
  outDir: 'dist',
})
