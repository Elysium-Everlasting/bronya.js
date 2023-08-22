import { App, Stack } from 'aws-cdk-lib/core'
import { isCdk } from '@bronya.js/core'
import { Api } from '@bronya.js/api-construct'

class MyStack extends Stack {
  api = new Api(this, 'api')

  constructor(scope: App, id: string) {
    super(scope, id)
  }
}

export async function main() {
  const app = new App()

  const stack = new MyStack(app, 'MyStack')

  const api = stack.api

  await api.init()

  // if (isCdk()) {
  //   await api.synth()
  // }

  return app
}

if (isCdk()) {
  main()
}
