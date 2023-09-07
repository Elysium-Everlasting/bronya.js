import type { MaybePromise } from './maybe-promise'
import type { Nullish } from './nullish'

export type TransformFunction<T> = (value: T) => MaybePromise<T | Nullish>

export async function maybeTransform<T>(value: T, transform?: TransformFunction<T>): Promise<T> {
  const transformedValues = await transform?.(value)
  return transformedValues ?? value
}
