import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { checkCostKwargs, checkOperationKwargs, readDataItemsAsCircAutogen } from '../../src/core/dataItemValidation.js'
import { DATA_ITEM_COST_TYPES, DATA_ITEM_OPERATIONS, DATA_TYPES, DEFAULT_COST_TYPE, PLOT_TYPES } from '../../src/core/dataItemVocabulary.js'

const RESOURCES = join(__dirname, '../resources')
// What circulatory_autogen #536's parser and funcs make of each case (scripts/generate_data_item_vectors.py).
const VECTORS = JSON.parse(readFileSync(join(RESOURCES, 'data-item-vectors.json'), 'utf8'))

/**
 * Reads data items as the port does, the way the vectors record it.
 *
 * @param {Object} document
 * @returns {{result: Array<Object>}|{error: string}}
 */
function outcome(document) {
  const { error, dataItems } = readDataItemsAsCircAutogen(document)
  return error ? { error } : { result: dataItems }
}

describe('the port of circulatory_autogen #536', () => {
  it.each(VECTORS.cases.map((vector) => [vector.name, vector]))('reads the data items "%s" as CA does', (_, vector) => {
    const { name, data_items: dataItems, ...expected } = vector
    expect(outcome({ protocol_info: VECTORS.protocol_info, prediction_items: VECTORS.prediction_items, data_items: dataItems })).toEqual(expected)
  })

  it.each(Object.entries(VECTORS.fixtures))('reads the data items of %s as CA does', (fileName, expected) => {
    expect(outcome(JSON.parse(readFileSync(join(RESOURCES, fileName), 'utf8')))).toEqual(expected)
  })

  it.each(VECTORS.operation_kwargs.map((vector) => [vector.operation, JSON.stringify(vector.kwargs), vector]))(
    'checks the operation_kwargs of %s, %s, as CA does',
    (_, __, { operation, operands, kwargs, error }) => {
      expect(checkOperationKwargs(kwargs, operation, { name: 'item', operandCount: operands })).toBe(error)
    }
  )

  it.each(VECTORS.cost_kwargs.map((vector) => [vector.cost_type, JSON.stringify(vector.kwargs), vector]))('checks the cost_kwargs of %s, %s, as CA does', (_, __, { cost_type: costType, kwargs, error }) => {
    expect(checkCostKwargs(kwargs, costType, { name: 'item' })).toBe(error)
  })

  it("has CA's vocabulary", () => {
    const { vocabulary } = VECTORS
    expect({ dataTypes: DATA_TYPES, plotTypes: PLOT_TYPES, defaultCostType: DEFAULT_COST_TYPE, operations: DATA_ITEM_OPERATIONS, costTypes: DATA_ITEM_COST_TYPES }).toEqual(vocabulary)
  })
})
