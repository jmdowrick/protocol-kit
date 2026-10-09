import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const SOURCE = join(__dirname, '../src')
// Every module specifier: static imports and re-exports (over several lines too), bare imports and dynamic ones.
const SPECIFIERS = /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"`]([^'"`]+)['"`]/g
// The editor's peers, which the host app provides.
const PEERS = /^(?:vue|papaparse|primevue(?:\/[\w/-]+)?)$/

/**
 * Lists the modules a folder of src imports, by the file that imports them.
 *
 * @param {string} folder - Under src.
 * @returns {{files: string[], imports: Array<[string, string]>}} File names relative to the folder.
 */
function readImports(folder) {
  const root = join(SOURCE, folder)
  const files = readdirSync(root, { recursive: true }).filter((name) => /\.(?:js|vue)$/.test(name))
  const imports = files.flatMap((name) => [...readFileSync(join(root, name), 'utf8').matchAll(SPECIFIERS)].map((match) => [name, match[1] ?? match[2] ?? match[3]]))
  return { files, imports }
}

/**
 * Whether any file imports a module by an expression rather than a name written out, which a check of its imports
 * would miss.
 *
 * @param {string} folder
 * @param {string[]} files
 * @returns {boolean}
 */
const importsByExpression = (folder, files) => files.some((name) => /\bimport\s*\(\s*[^'"`\s]/.test(readFileSync(join(SOURCE, folder, name), 'utf8')))

describe('src', () => {
  it('keeps the core to its own modules, so it runs anywhere without a framework', () => {
    const { files, imports } = readImports('core')
    expect(imports.length).toBeGreaterThan(0)
    expect(imports.filter(([, from]) => !/^\.\/\w+\.js$/.test(from))).toEqual([])
    expect(importsByExpression('core', files)).toBe(false)
  })

  it('keeps the editor to its own modules, the core and its peers', () => {
    const { files, imports } = readImports('editor')
    const isAllowed = ([name, from]) => {
      if (PEERS.test(from)) return true
      if (!from.startsWith('.')) return false
      const target = relative(SOURCE, resolve(SOURCE, 'editor', dirname(name), from))
      return /^(?:core|editor)\//.test(target)
    }
    expect(imports.filter((entry) => !isAllowed(entry))).toEqual([])
    expect(importsByExpression('editor', files)).toBe(false)
  })
})
