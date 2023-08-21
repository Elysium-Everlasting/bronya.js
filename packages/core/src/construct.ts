import { Stack } from 'aws-cdk-lib/core'
import { Construct } from 'constructs'

import type { Plugin } from './plugin'

import { type App } from '.'

export const BronyaSymbol = 'Bronya Construct'

/**
 * Augmented construct.
 */
export class BronyaConstruct extends Construct {
  scope = BronyaSymbol

  plugins: Plugin[] = []

  static isBronyaConstruct(value: unknown): value is BronyaConstruct {
    return Construct.isConstruct(value) && (value as BronyaConstruct).scope === BronyaSymbol
  }

  constructor(scope: Construct, id: string) {
    super(scope, id)
  }
}

export function isBronyaConstruct(construct: unknown): construct is BronyaConstruct {
  return Construct.isConstruct(construct) && (construct as BronyaConstruct).scope === BronyaSymbol
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
  const stacks = app.node.children.filter(Stack.isStack)

  const bronyaConstructs = findNestedBronyaConstructs(stacks)

  return bronyaConstructs.flatMap((construct) => construct.plugins)
}
