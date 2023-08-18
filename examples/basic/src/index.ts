import { Api } from '@klein.js/core/api'
import { App } from 'aws-cdk-lib'

async function main() {
  const app = new App()
  const api = new Api(app, 'api')

  console.log(app)

  console.log(api)

  await api.dev()
}

main()
