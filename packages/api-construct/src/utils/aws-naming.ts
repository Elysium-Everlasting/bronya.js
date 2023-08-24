/**
 * Replace forward slashes with dashes.
 * Replace braces with underscores.
 */
export function toValidAwsName(name: string): string {
  return name.replace(/\//g, '-').replace(/{|}/g, '_')
}
