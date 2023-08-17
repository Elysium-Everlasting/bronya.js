import { Construct } from 'constructs'
import esbuild from 'esbuild'

export class Api extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id)
  }

  async dev() {
    console.log(esbuild)
  }
}
