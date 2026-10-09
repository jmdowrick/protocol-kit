import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { readPredictionItemsAsCircAutogen } from '../../src/core/predictionValidation.js'

const RESOURCES = join(__dirname, '../resources')
// What circulatory_autogen #536's parser makes of each case (scripts/generate_prediction_vectors.py).
const VECTORS = JSON.parse(readFileSync(join(RESOURCES, 'prediction-vectors.json'), 'utf8'))

/**
 * Reads prediction items as the port does, the way the vectors record it.
 *
 * @param {Object} document
 * @returns {{result: Object}|{error: string}}
 */
function outcome(document) {
  const { error, predictionInfo } = readPredictionItemsAsCircAutogen(document)
  return error ? { error } : { result: predictionInfo }
}

describe('the port of circulatory_autogen #536', () => {
  it.each(VECTORS.cases.map((vector) => [vector.name, vector]))('reads the prediction items "%s" as CA does', (_, vector) => {
    const { name, prediction_items: predictionItems, ...expected } = vector
    expect(outcome({ protocol_info: VECTORS.protocol_info, data_items: VECTORS.data_items, prediction_items: predictionItems })).toEqual(expected)
  })

  it.each(Object.entries(VECTORS.fixtures))('reads the prediction items of %s as CA does', (fileName, expected) => {
    expect(outcome(JSON.parse(readFileSync(join(RESOURCES, fileName), 'utf8')))).toEqual(expected)
  })
})
