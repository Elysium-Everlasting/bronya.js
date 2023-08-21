import { App } from 'aws-cdk-lib/core'
import { Api } from '@bronya.js/api-construct/api'

export async function main() {
  const app = new App()

  const api = new Api(app, 'api', {
    directory: 'src/api',
    entryPoint: 'index.ts',
    outDirectory: 'dist',
    exitPoint: 'handler.js',
    esbuild: {},
    environment: {},
  })

  await api.init()

  return app
}
