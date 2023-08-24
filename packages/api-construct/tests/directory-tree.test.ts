import { describe, test, expect } from 'vitest'

import { resolveDirectoryTree, type DirectoryTreeDetails } from '../src/utils/directory-tree.js'

describe('directory tree', () => {
  test('should resolve directory tree', () => {
    const details: DirectoryTreeDetails = {
      root: '/home/users/my-project',
      directory: 'src',
      outDirectory: '.bronya',
      uploadDirectory: 'dist',
      entryPoint: 'index.js',
      exitPoint: 'handler.js',
    }

    const resolved = resolveDirectoryTree(details)

    expect(resolved.root).toBe('/home/users/my-project')
    expect(resolved.directory).toBe('/home/users/my-project/src')
    expect(resolved.outDirectory).toBe('/home/users/my-project/.bronya')
    expect(resolved.directoryToOutDirectory('/home/users/my-project/src')).toBe(
      '/home/users/my-project/.bronya',
    )
    expect(resolved.directoryToUploadDirectory('/home/users/my-project/src')).toBe(
      '/home/users/my-project/.bronya/dist',
    )
    expect(resolved.directoryToEndpoint('/home/users/my-project/src/v1/rest/calendar')).toBe(
      '/v1/rest/calendar',
    )
  })
})
