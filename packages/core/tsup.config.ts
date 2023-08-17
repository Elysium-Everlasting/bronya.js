import { defineConfig } from 'tsup'

/**
 * @see https://github.com/evanw/esbuild/issues/1921#issuecomment-1491470829
 */
const js = `\
import topLevelModule from 'node:module';
import topLevelPath from 'node:path'
import topLevelUrl from 'node:url'

const require = topLevelModule.createRequire(import.meta.url);
const __filename = topLevelUrl.fileURLToPath(import.meta.url);
const __dirname = topLevelPath.dirname(__filename);
`

export default defineConfig({
  entry: {
    api: 'src/api.ts',
  },
  format: ['cjs', 'esm'],
  // noExternal: [/.*/],
  // banner(ctx) {
  //   return ctx.format === 'esm' ? { js } : undefined
  // },
  dts: true,
  outDir: 'dist',
})
