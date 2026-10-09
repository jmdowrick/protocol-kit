import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { computeFeatures } from '../../src/core/features.js'

const RESOURCES = join(__dirname, '../resources')
// A run's features as circulatory_autogen's features_from_segments computes them (scripts/generate_operation_vectors.py).
const { features: VECTORS } = JSON.parse(readFileSync(join(RESOURCES, 'operation-vectors.json'), 'utf8'))

/**
 * Reads a series as the vectors write it: float64 bytes, little-endian, in base64.
 *
 * @param {string} encoded
 * @returns {Float64Array}
 */
function decodeSeries(encoded) {
  const bytes = Buffer.from(encoded, 'base64')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Float64Array.from({ length: bytes.byteLength / 8 }, (_, index) => view.getFloat64(index * 8, true))
}

const SEGMENTS = VECTORS.segments.map((subs) => subs.map((segment) => ({ values: Object.fromEntries(Object.entries(segment).map(([name, encoded]) => [name, decodeSeries(encoded)])) })))

describe('computeFeatures', () => {
  it("gives CA's features of a run, to the bit, each over its own sub-experiment", () => {
    const features = computeFeatures(VECTORS.document, SEGMENTS)
    expect(features.map(({ name, experiment, subexperiment, value }) => ({ name, segment: [experiment, subexperiment], value }))).toEqual(VECTORS.features)
    expect(features.every(({ error }) => error === null)).toBe(true)
  })

  it('groups features as CA names them for plotting, with their units and places', () => {
    const [peak, , step, , hold] = computeFeatures(VECTORS.document, SEGMENTS)
    expect(peak).toMatchObject({ index: 1, name: 'I_peak_e0', group: 'I_peak', operation: 'min_in_range', unit: 'uA_per_cm2' })
    expect(step).toMatchObject({ group: 'V_step', experiment: 0, subexperiment: 1, value: -40 })
    // Without an item_name_for_plotting, the first operand.
    expect(hold.group).toBe('membrane/V')
  })

  it("takes a constant given as a number, and says what wasn't run or recorded", () => {
    const document = {
      protocol_info: { pre_times: [0, 0], sim_times: [[1], [1]], params_to_change: {} },
      prediction_items: [
        { data_item_name: 'g', operands: ['p/g'], unit: 'mS', operation: 'mean' },
        { data_item_name: 'V_max', operands: ['m/V'], unit: 'mV', operation: 'max' },
        { data_item_name: 'V_max_e1', operands: ['m/V'], unit: 'mV', operation: 'max', experiment_idx: 1 },
        { data_item_name: 'V_series', operands: ['m/V'], unit: 'mV', operation: 'max', data_type: 'series' },
      ],
    }
    const features = computeFeatures(document, [[{ values: { 'p/g': 0.12 } }]])
    expect(features.map(({ name, value, error }) => [name, value, error])).toEqual([
      ['g', 0.12, null],
      ['V_max', NaN, "m/V wasn't recorded."],
      ['V_max_e1', NaN, "Sub-experiment 1 of experiment 2 wasn't run."],
    ])
  })

  it("gives a mean over no samples as NaN, as numpy does, and a maximum over none CA's error", () => {
    const document = {
      protocol_info: { pre_times: [0], sim_times: [[1]], params_to_change: {} },
      prediction_items: [
        { data_item_name: 'a', operands: ['m/V'], unit: 'mV', operation: 'mean_in_range', operation_kwargs: { start_frac: 0, end_frac: 0.01 } },
        { data_item_name: 'b', operands: ['m/V'], unit: 'mV', operation: 'max_in_range', operation_kwargs: { start_frac: 0, end_frac: 0.01 } },
        { data_item_name: 'c', operands: ['m/V'], unit: 'mV', operation: 'max', experiment_idx: 3 },
      ],
    }
    const features = computeFeatures(document, [[{ values: { 'm/V': [1, 2, 3] } }]])
    expect(features.map(({ value, error }) => [value, error])).toEqual([
      [NaN, 'Its range takes no samples.'],
      [NaN, 'zero-size array to reduction operation maximum which has no identity'],
      [NaN, "prediction_items[2] ('c'): experiment_idx 3 is not an experiment of protocol_info, which has 1."],
    ])
  })
})
