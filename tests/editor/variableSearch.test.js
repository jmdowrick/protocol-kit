import { describe, expect, it } from 'vitest'

import { isSettable, searchVariables, splitVariableName } from '../../src/editor/variableSearch.js'

// As a host lists its model's variables, by the names a protocol gives them.
const VARIABLES = [
  { name: 'Na_channel/g_Na', label: 'Sodium conductance', unit: 'mS', kind: 'constant', value: 120 },
  { name: 'Na_channel/V', unit: 'mV', kind: 'variable' },
  { name: 'membrane/V', unit: 'mV', kind: 'variable' },
  { name: 'membrane/g_Na_eff', unit: 'mS', kind: 'variable' },
  { name: 'global_parameters/R', unit: 'J_per_K_mol', kind: 'global_constant', value: 8314 },
]

const names = (variables) => variables.map((variable) => variable.name)

describe('searchVariables', () => {
  it('matches every word anywhere in the name, in any order', () => {
    expect(names(searchVariables(VARIABLES, 'na g'))).toEqual(['Na_channel/g_Na', 'membrane/g_Na_eff'])
    expect(names(searchVariables(VARIABLES, 'membrane/v'))).toEqual(['membrane/V'])
  })

  it('matches the label too', () => {
    expect(names(searchVariables(VARIABLES, 'sodium'))).toEqual(['Na_channel/g_Na'])
  })

  it('puts exact variable names first, then names that start with a word', () => {
    expect(names(searchVariables(VARIABLES, 'v')).slice(0, 2)).toEqual(['membrane/V', 'Na_channel/V'])
  })

  it('filters and limits the results', () => {
    expect(names(searchVariables(VARIABLES, '', { filter: isSettable }))).toEqual(['Na_channel/g_Na', 'global_parameters/R'])
    expect(searchVariables(VARIABLES, '', { limit: 2 })).toHaveLength(2)
  })

  it('skips variables without a name', () => {
    expect(searchVariables([{ label: 'x' }, null], '')).toEqual([])
  })
})

describe('splitVariableName', () => {
  it('splits at the first slash', () => {
    expect(splitVariableName('membrane/V')).toEqual({ component: 'membrane', name: 'V' })
    expect(splitVariableName('V')).toEqual({ component: '', name: 'V' })
  })
})

describe('isSettable', () => {
  it('sets parameters only', () => {
    expect(VARIABLES.filter(isSettable).map((variable) => variable.kind)).toEqual(['constant', 'global_constant'])
  })
})
