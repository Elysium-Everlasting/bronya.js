import { App, Stack } from 'aws-cdk-lib/core'
import type { Construct } from 'constructs'
import { describe, test, expect } from 'vitest'

import { BronyaConstruct, findNestedBronyaConstructs, getAppPlugins } from '../src/construct.js'

class MyStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id)
  }
}

class ConstructA extends BronyaConstruct {
  constructor(scope: Construct, id: string) {
    super(scope, id)
    this.plugins.push({ type: 'placeholder', name: 'A' })
  }
}

class ConstructB extends BronyaConstruct {
  constructor(scope: Construct, id: string) {
    super(scope, id)
    this.plugins.push({ type: 'cli', name: 'B' })
  }
}

class ConstructC extends BronyaConstruct {
  constructor(scope: Construct, id: string) {
    super(scope, id)
    this.plugins.push({ type: 'placeholder', name: 'C' })
  }
}

describe('constructs and plugins', () => {
  test('find constructs', () => {
    const app = new App()

    const stack = new MyStack(app, 'MyStack')

    new ConstructA(stack, 'ConstructA')

    new ConstructB(stack, 'ConstructB')

    new ConstructC(stack, 'ConstructC')

    const bronyaConstructs = findNestedBronyaConstructs(app.node.children)

    expect(bronyaConstructs).toHaveLength(3)
  })

  test('find plugins', () => {
    const app = new App()

    const stack = new MyStack(app, 'MyStack')

    new ConstructA(stack, 'ConstructA')

    new ConstructB(stack, 'ConstructB')

    new ConstructC(stack, 'ConstructC')

    const plugins = getAppPlugins(app)

    expect(plugins).toHaveLength(3)
  })
})
