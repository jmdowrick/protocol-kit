import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseObsData, serialiseObsData } from '../../src/core/obsDataDocument.js'
import {
  addEmptyExperiment,
  addExperiment,
  addParameter,
  addSubExperiment,
  alignWithWarmUp,
  moveExperiment,
  removeExperiment,
  removeParameter,
  removeSubExperiment,
  setInput,
  setTiming,
  setValue,
} from '../../src/core/protocolEditing.js'
import { validateProtocolInfo } from '../../src/core/protocolValidation.js'

const RESOURCES = join(__dirname, '../resources')
// br-1977 has shapes and paces engine/pace, SN_simple has traces, NKE_pump plain values, and the last prediction items
// as circulatory_autogen #536 reads them: operations over a sub-experiment, and held-out values.
const FIXTURES = ['br-1977_obs_data.json', 'SN_simple_obs_data.json', 'NKE_pump_obs_data.json', 'prediction_items_536_obs_data.json']
// The keys of protocol_info the edits write; every other one is the file's own.
const OWNED = ['pre_times', 'sim_times', 'experiment_labels', 'experiment_colors', 'experiment_ids', 'params_to_change', 'protocol_shapes', 'protocol_traces']
// The keys of an observation the edits write: they renumber it, nothing else.
const RENUMBERED = ['experiment_idx', 'subexperiment_idx']

const readText = (fileName) => readFileSync(join(RESOURCES, fileName), 'utf8')
const decode = (buffer) => new TextDecoder().decode(buffer)
// JSON.stringify writes -0 as 0, where Python writes -0.0: the same value, so -0 is read as 0 to compare.
const readJson = (text) => JSON.parse(text, (_, value) => (Object.is(value, -0) ? 0 : value))
const isCanonical = (text) => `${JSON.stringify(JSON.parse(text), null, 2)}\n` === text

/**
 * Reads a fixture with keys no edit knows of added: in the document, its protocol_info (CA refuses x_custom there,
 * but a file may have it all the same) and its observations.
 *
 * @param {string} fileName
 * @returns {Object}
 */
function readWithUnknownKeys(fileName) {
  const document = readJson(readText(fileName))
  document.x_study = { owner: 'someone', tags: ['a', 'b'] }
  Object.assign(document.protocol_info, { comment: 'kept', offline_pre_time: 3, x_custom: { nested: [1, '2', null] } })
  for (const key of ['data_items', 'prediction_items']) {
    for (const item of document[key] ?? []) item.x_note = `${item.data_item_name} note`
  }
  return document
}

/**
 * Lists every edit, as it applies to a document, by name.
 *
 * @param {Object} document
 * @returns {Array<[string, Function]>}
 */
function listEdits(document) {
  const info = document.protocol_info
  const last = info.sim_times.length - 1
  const [parameter] = Object.keys(info.params_to_change)
  return [
    ['addExperiment', () => addExperiment(document, 0)],
    ['addEmptyExperiment', () => addEmptyExperiment(document, { duration: 2 })],
    ['removeExperiment', () => removeExperiment(document, 0)],
    ['moveExperiment', () => moveExperiment(document, 0, last)],
    ['addSubExperiment', () => addSubExperiment(document, 0)],
    ['removeSubExperiment', () => removeSubExperiment(document, last, 0)],
    ['setTiming', () => setTiming(document, { experiment: 0, sub: 0, preTime: 5, duration: 7, label: 'renamed' })],
    ['addParameter', () => addParameter(document, 'added/k', 1)],
    ['removeParameter', () => removeParameter(document, parameter)],
    ['setValue', () => setValue(document, { parameter, experiment: 0, sub: 0, value: 2 })],
    ['setInput', () => setInput(document, { parameter, experiment: 0, sub: 0, trace: { t: [0, 1], values: [0, 1] } })],
    ['alignWithWarmUp', () => alignWithWarmUp(document, { parameter, experiment: 0, trace: { t: [0, 1], values: [0, 1] } })],
  ]
}

/**
 * Drops an observation's renumbered keys, leaving the ones no edit may change.
 *
 * @param {Object} item
 * @returns {Object}
 */
const withoutIndices = (item) => Object.fromEntries(Object.entries(item).filter(([key]) => !RENUMBERED.includes(key)))

describe('a round trip through parseObsData and serialiseObsData', () => {
  it.each(FIXTURES)('gives back %s as it was', (fileName) => {
    const text = readText(fileName)
    const written = decode(serialiseObsData(parseObsData(text).document))
    expect(JSON.parse(written)).toEqual(readJson(text))
    // A file in the canonical form comes back byte for byte; any other, in that form, from then on.
    if (isCanonical(text)) expect(written).toBe(text)
    expect(decode(serialiseObsData(parseObsData(written).document))).toBe(written)
  })

  it('checks a fixture byte for byte', () => {
    expect(isCanonical(readText('prediction_items_536_obs_data.json'))).toBe(true)
  })

  it.each(FIXTURES)('keeps the keys no edit knows of in %s', (fileName) => {
    const document = readWithUnknownKeys(fileName)
    const written = decode(serialiseObsData(document))
    expect(parseObsData(written).document).toEqual(document)
  })

  it.each(FIXTURES)('reads the protocol of %s as CA does', (fileName) => {
    expect(validateProtocolInfo(parseObsData(readText(fileName)).protocolInfo).errors).toEqual([])
  })
})

describe.each(FIXTURES)('editing %s', (fileName) => {
  const document = readWithUnknownKeys(fileName)

  it.each(listEdits(document))('%s leaves what it does not own untouched', (_, edit) => {
    const before = JSON.stringify(document)
    const edited = edit()
    expect(JSON.stringify(document)).toBe(before)
    const { protocol_info: info, data_items: dataItems, prediction_items: predictionItems, ...rest } = edited
    const { protocol_info: givenInfo, data_items: givenData, prediction_items: givenPredictions, ...givenRest } = document
    expect(rest).toEqual(givenRest)
    const unowned = (protocolInfo) => Object.fromEntries(Object.entries(protocolInfo).filter(([key]) => !OWNED.includes(key)))
    expect(unowned(info)).toEqual(unowned(givenInfo))
    // Observations are renumbered or dropped, never otherwise changed.
    for (const [items, given] of [
      [dataItems, givenData],
      [predictionItems, givenPredictions],
    ]) {
      if (given === undefined) {
        expect(items).toBeUndefined()
        continue
      }
      const byName = new Map(given.map((item) => [item.data_item_name, withoutIndices(item)]))
      for (const item of items) expect(withoutIndices(item)).toEqual(byName.get(item.data_item_name))
    }
  })
})
