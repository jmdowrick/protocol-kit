import { describe, expect, it } from 'vitest'

import { EXPERIMENT_PALETTE, resolveExperimentColour } from '../../src/core/experimentColours.js'

describe('resolveExperimentColour', () => {
  it('reads a matplotlib letter or a hex colour, alpha kept, and falls back to the colour of its place', () => {
    expect(resolveExperimentColour('r', 0)).toBe('#e34948')
    expect(resolveExperimentColour('#ff000080', 0)).toBe('#ff000080')
    expect(resolveExperimentColour('#0f0', 0)).toBe('#0f0')
    expect(resolveExperimentColour('#12345', 1)).toBe(EXPERIMENT_PALETTE[1])
    expect(resolveExperimentColour(null, 9)).toBe(EXPERIMENT_PALETTE[1])
  })

  it("falls back to the host's palette when given one", () => {
    const palette = ['#000', '#111', '#222']
    expect(resolveExperimentColour(undefined, 4, palette)).toBe('#111')
    expect(resolveExperimentColour('purple', 0, palette)).toBe('#000')
    expect(resolveExperimentColour('b', 0, palette)).toBe('#2a78d6')
  })

  it("defaults to PhLynx's light series colours", () => {
    expect(EXPERIMENT_PALETTE).toEqual(['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'])
  })
})
