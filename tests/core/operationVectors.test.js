import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { OperationError, applyOperation, computeMean, sliceRange, sumPairwise } from '../../src/core/operations.js'

const RESOURCES = join(__dirname, '../resources')
// What circulatory_autogen's own operation funcs give for each case (scripts/generate_operation_vectors.py).
const VECTORS = JSON.parse(readFileSync(join(RESOURCES, 'operation-vectors.json'), 'utf8'))
const SPECIAL = { nan: NaN, inf: Infinity, '-inf': -Infinity }

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

const SERIES = Object.fromEntries(Object.entries(VECTORS.series).map(([name, encoded]) => [name, decodeSeries(encoded)]))

/**
 * Applies an operation as the port does, the way the vectors record it.
 *
 * @param {Object} vector
 * @returns {{value: number}|{error: string}}
 */
function outcome({ series, operation, operation_kwargs: kwargs }) {
  try {
    return { value: applyOperation(operation, [SERIES[series]], kwargs ?? {}) }
  } catch (error) {
    if (!(error instanceof OperationError)) throw error
    return { error: error.pythonType }
  }
}

describe("the port of circulatory_autogen's operations", () => {
  it.each(VECTORS.cases.map((vector) => [`${vector.operation}(${vector.series}, ${JSON.stringify(vector.operation_kwargs)})`, vector]))('gives %s as CA does, to the bit', (_, vector) => {
    const result = outcome(vector)
    if ('error' in vector) expect(result).toEqual({ error: vector.error })
    // Object.is tells -0 from 0, and NaN is NaN.
    else expect(Object.is(result.value, SPECIAL[vector.value] ?? vector.value), `${result.value ?? result.error} for ${vector.value}`).toBe(true)
  })

  it('covers each operation, and errors CA raises', () => {
    const operations = new Set(VECTORS.cases.map(({ operation }) => operation))
    expect(operations.size).toBe(8)
    expect(VECTORS.cases.some((vector) => vector.error === 'ValueError')).toBe(true)
  })
})

describe('sumPairwise', () => {
  it('sums in numpy order, which a plain loop does not', () => {
    // Over 128 values a plain sum rounds differently from numpy's pairs of blocks.
    const values = Float64Array.from({ length: 1001 }, (_, index) => (index % 7 === 0 ? 1e16 : 0.1 * index) * (index % 2 ? -1 : 1))
    let plain = 0
    for (const value of values) plain += value
    expect(sumPairwise(values)).not.toBe(plain)
    expect(computeMean(values)).toBe(sumPairwise(values) / values.length)
  })

  it('makes a sum of negative zeros 0, and a mean of nothing NaN', () => {
    expect(Object.is(computeMean([-0, -0]), 0)).toBe(true)
    expect(computeMean([])).toBeNaN()
  })
})

describe('sliceRange', () => {
  it('slices as Python does, the end left out', () => {
    const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(sliceRange(values, { start_frac: 0, end_frac: 0.2 })).toEqual([0, 1])
    expect(sliceRange(values)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(sliceRange(values, { start_frac: -0.2, end_frac: 1 })).toEqual([9])
    expect(sliceRange(values, { start_frac: 0.5, end_frac: 2 })).toEqual([5, 6, 7, 8, 9, 10])
    expect(sliceRange(values, { start_frac: 0.8, end_frac: 0.2 })).toEqual([])
  })
})

describe('applyOperation', () => {
  it('replaces a kwarg naming an earlier item with its value, and refuses a later one', () => {
    const values = [0, 1, 2, 3, 4]
    expect(applyOperation('max_in_range', [values], { start_frac: 'start', end_frac: 1 }, { computed: new Map([['start', 0.5]]) })).toBe(3)
    expect(() => applyOperation('max_in_range', [values], { start_frac: 'later' }, { name: 'peak', itemNames: new Set(['later']) })).toThrow(
      "data_item 'peak': 'operation_kwargs' key 'start_frac' references data_item 'later', which has not been computed yet."
    )
  })

  it("refuses kwargs the operation doesn't take, an operation it doesn't know, and other than one operand", () => {
    expect(() => applyOperation('max', [[1]], { start_frac: 0 }, { name: 'peak' })).toThrow(
      "Invalid 'operation_kwargs' key 'start_frac' in data_item 'peak': the operation func 'max' has no keyword argument 'start_frac'. Accepted keyword arguments are: ['x']."
    )
    expect(() => applyOperation('mean_in_range', [[1]], { series_output: true })).toThrow("'series_output' is set by circulatory_autogen")
    expect(() => applyOperation('first_peak_time', [[1]])).toThrow("operation 'first_peak_time' is not one protocol-kit computes.")
    expect(() => applyOperation('max', [[1], [2]])).toThrow('max takes one operand, got 2.')
  })
})
