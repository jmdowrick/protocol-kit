import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as kit from '../src/index.js'

describe('@physiomelinks/protocol-kit', () => {
  it('exports everything the core modules export', async () => {
    const modules = readdirSync(join(__dirname, '../src/core')).filter((name) => name.endsWith('.js'))
    expect(modules.length).toBeGreaterThan(0)
    for (const name of modules) {
      const module = await import(`../src/core/${name}`)
      for (const [key, value] of Object.entries(module)) expect(kit[key], `${name}: ${key}`).toBe(value)
    }
  })
})
