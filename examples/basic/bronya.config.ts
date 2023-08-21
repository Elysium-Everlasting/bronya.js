import { App, Stack } from 'aws-cdk-lib/core'
import { isCdk } from '@bronya.js/core'
import { Api } from '@bronya.js/api-construct/api'

class MyStack extends Stack {
  api = new Api(this, 'api', {
    directory: 'src/api',
    entryPoint: 'index.ts',
    outDirectory: 'dist',
    exitPoint: 'handler.js',
    esbuild: {},
    environment: {},
  })

  constructor(scope: App, id: string) {
    super(scope, id)
  }
}

export async function main() {
  const app = new App()

  const stack = new MyStack(app, 'MyStack')

  const api = stack.api

  await api.init()

  if (isCdk()) {
    await api.synth()
  }

  return app
}
