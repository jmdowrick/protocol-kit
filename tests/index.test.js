import { describe, expect, it } from 'vitest'

import * as kit from '../src/index.js'
import * as editor from '../src/editor/index.js'
import * as protocolKinds from '../src/editor/protocolKinds.js'
import * as variableSearch from '../src/editor/variableSearch.js'

describe('@physiomelinks/protocol-kit', () => {
  it('exports everything the core modules export', () => {
    const modules = Object.entries(import.meta.glob('../src/core/*.js', { eager: true }))
    expect(modules.length).toBeGreaterThan(0)
    for (const [name, module] of modules) {
      for (const [key, value] of Object.entries(module)) expect(kit[key], `${name}: ${key}`).toBe(value)
    }
  })
})

describe('@physiomelinks/protocol-kit/editor', () => {
  it('exports the components, and what the modules beside them export', () => {
    expect(Object.keys(editor)).toEqual(expect.arrayContaining(['ProtocolEditor', 'ProtocolCellEditor', 'InlineNumber', 'NumberInput', 'VariablePicker']))
    for (const [name, module] of Object.entries({ protocolKinds, variableSearch })) {
      for (const [key, value] of Object.entries(module)) expect(editor[key], `${name}: ${key}`).toBe(value)
    }
  })
})
