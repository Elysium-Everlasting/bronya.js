// Injected by node:vm's context.
declare var shouldExecuteMain: boolean

import { App } from 'aws-cdk-lib/core'
import { Api } from '../../dist/api.js'

export async function main() {
  const app = new App()

  new Api(app, 'api')

  return app
}

if (typeof shouldExecuteMain != 'undefined' && shouldExecuteMain) {
  main()
}
