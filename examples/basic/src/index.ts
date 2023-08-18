import { Api, startApiDevelopmentExpress } from '@klein.js/core/api'
import { App } from 'aws-cdk-lib'

async function main() {
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

  console.log(api)

  await startApiDevelopmentExpress(api)
}

main()
