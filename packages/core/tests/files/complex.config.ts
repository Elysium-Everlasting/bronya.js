// Injected by node:vm's context.
declare var shouldExecuteMain: boolean

import { App } from 'aws-cdk-lib'

export async function main() {
  const app = new App()
  return app
}

if (typeof shouldExecuteMain != 'undefined' && shouldExecuteMain) {
  main()
}
