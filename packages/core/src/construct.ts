import type { App } from 'aws-cdk-lib/core'
import { Construct } from 'constructs'

import type { Plugin } from './plugin.js'

export const BronyaSymbol = 'Bronya Construct'

/**
 * Augmented construct.
 */
export class BronyaConstruct extends Construct {
  bronya = BronyaSymbol

  plugins: Plugin[] = []

  static isBronyaConstruct(value: unknown): value is BronyaConstruct {
    return Construct.isConstruct(value) && (value as BronyaConstruct).bronya === BronyaSymbol
  }

  constructor(scope: Construct, id: string) {
    super(scope, id)
  }
}

export function isBronyaConstruct(construct: unknown): construct is BronyaConstruct {
  return Construct.isConstruct(construct) && (construct as BronyaConstruct).bronya === BronyaSymbol
}

/**
 * Find {@link BronyaConstruct} in a construct tree.
 *
 * Optimization: stop checking a node's children as soon as one is found.
 */
export function findNestedBronyaConstructs(constructs: Construct[]): BronyaConstruct[] {
  const bronyaConstructs: BronyaConstruct[] = []

  const addedIndices = new Set<number>()

  constructs.forEach((construct, index) => {
    if (BronyaConstruct.isBronyaConstruct(construct)) {
      bronyaConstructs.push(construct)
      addedIndices.add(index)
    }
  })

  const toFind = constructs.filter((_, index) => !addedIndices.has(index))

  if (!toFind.length) {
    return bronyaConstructs
  }

  bronyaConstructs.push(
    ...findNestedBronyaConstructs(toFind.flatMap((construct) => construct.node.children)),
  )

  return bronyaConstructs
}

export function getAppPlugins(app: App): Plugin[] {
  const bronyaConstructs = findNestedBronyaConstructs(app.node.children)
  return bronyaConstructs.flatMap((construct) => construct.plugins)
}

export { Construct }
