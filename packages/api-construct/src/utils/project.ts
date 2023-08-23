import fs from 'node:fs'
import path from 'node:path'

import { findDirectoriesWithFile } from './directories.js'
import { isFileReadable } from './files.js'

// https://github.com/vitejs/vite/issues/2820#issuecomment-812495079
const ROOT_FILES = [
  // '.git',

  // https://pnpm.io/workspaces/
  'pnpm-workspace.yaml',

  // https://rushjs.io/pages/advanced/config_files/
  // 'rush.json',

  // https://nx.dev/latest/react/getting-started/nx-setup
  // 'workspace.json',
  // 'nx.json',

  // https://github.com/lerna/lerna#lernajson
  'lerna.json',
]

// npm: https://docs.npmjs.com/cli/v7/using-npm/workspaces#installing-workspaces
// yarn: https://classic.yarnpkg.com/en/docs/workspaces/#toc-how-to-use-it
export function hasWorkspacePackageJSON(root: string): boolean {
  const currentDirectoryPackageJson = path.join(root, 'package.json')

  if (!isFileReadable(currentDirectoryPackageJson)) {
    return false
  }

  const content = JSON.parse(fs.readFileSync(currentDirectoryPackageJson, 'utf-8')) || {}
  return !!content.workspaces
}

export function hasRootFile(root: string): boolean {
  return ROOT_FILES.some((file) => fs.existsSync(path.join(root, file)))
}

export function hasPackageJSON(root: string) {
  const currentDirectoryPackageJson = path.join(root, 'package.json')
  return fs.existsSync(currentDirectoryPackageJson)
}

/**
 * Search up for the nearest `package.json`, i.e. the current project root.
 */
export function getClosestProjectDirectory(current = process.cwd(), root = current): string {
  if (hasPackageJSON(current)) {
    return current
  }

  const currentDirectory = path.dirname(current)

  // reach the fs root
  if (!currentDirectory || currentDirectory === current) {
    return root
  }

  return getClosestProjectDirectory(currentDirectory, root)
}

/**
 * Search up for the nearest workspace root.
 */
export function getWorkspaceRoot(
  current = process.cwd(),
  root = getClosestProjectDirectory(current),
): string {
  if (hasRootFile(current) || hasWorkspacePackageJSON(current)) {
    return current
  }

  const currentDirectory = path.dirname(current)

  // reach the fs root
  if (!currentDirectory || currentDirectory === current) {
    return root
  }

  return getWorkspaceRoot(currentDirectory, root)
}

/**
 * Recursively find all paths to projects starting from a given root directory.
 */
export function findAllProjects(root = process.cwd()): string[] {
  return findDirectoriesWithFile('package.json', root)
}
