import { Parser, type ExtendNode } from 'acorn'
import { tsPlugin } from 'acorn-typescript'
import type {
  ExportNamedDeclaration,
  VariableDeclaration,
  FunctionDeclaration,
  Identifier,
  Program,
} from 'estree'

// Because of some tomfoolery, the `acorn` namespace is now available globally :^)

type NamedExportNode = ExtendNode<ExportNamedDeclaration>

type VariableDeclaratorNode = ExtendNode<VariableDeclaration>

type FunctionDeclarationNode = ExtendNode<FunctionDeclaration>

type IdentifierNode = ExtendNode<Identifier>

const defaultParseOptions: acorn.Options = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  locations: true,
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const tsParser = Parser.extend(tsPlugin() as any)

/**
 * In order to dynamically generate runtime files, allocate API Gateway routes, etc.
 * the built entry (handlers) file's named exports need to be statically analyzed,
 * which indicates the HTTP methods it supports.
 *
 * @example
 *
 * ```ts
 *
 * export const GET: InternalHandler = async (event) => { ... }
 * export const POST: InternalHandler = async (event) => { ... }
 *
 * const myHandler: InternalHandler = async (event) => { ... }
 * export { myHandler as PUT }
 * ```
 *
 * Named exports of above module: ["GET", "POST", "PUT"]
 *
 * @param fileContents The file contents to analyze.
 * @returns All the parsed file's named exports. Does __not__ filter for valid HTTP method exports.
 */
export function getNamedExports(
  fileContents: string,
  parseOptions: acorn.Options = defaultParseOptions,
) {
  const parsedFileContents = tsParser.parse(fileContents, parseOptions) as ExtendNode<Program>

  /**
   * @example
   *
   * ```ts
   * const myHandler: InternalHandler = async (event) => { ... }
   * export { myHandler as GET }
   * ```
   */
  const moduleExports = parsedFileContents.body
    .filter((node): node is NamedExportNode => node.type === 'ExportNamedDeclaration')
    .map((node) => node.declaration)
    .filter((node): node is VariableDeclaratorNode => node?.type === 'VariableDeclaration')
    .flatMap((node) => node.declarations.map((declaration) => declaration.id))
    .filter((id): id is IdentifierNode => id?.type === 'Identifier')
    .map((id) => id.name)

  /**
   * @example
   *
   * ```ts
   * export const GET: InternalHandler = async (event) => { ... }
   * ```
   */
  const constExports = parsedFileContents.body
    .filter((node): node is NamedExportNode => node.type === 'ExportNamedDeclaration')
    .flatMap((node) => node.specifiers.map((specifier) => specifier.exported.name))

  /**
   * @example
   *
   * ```ts
   * export async function GET (event) { ... }
   * ```
   */
  const functionExports = parsedFileContents.body
    .filter((node): node is NamedExportNode => node.type === 'ExportNamedDeclaration')
    .map((node) => node.declaration)
    .filter((node): node is FunctionDeclarationNode => node?.type === 'FunctionDeclaration')
    .flatMap((node) => node.id?.name)
    .filter((name): name is string => typeof name === 'string')

  moduleExports.push(...constExports, ...functionExports)

  return moduleExports
}
