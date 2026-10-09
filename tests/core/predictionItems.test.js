import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { addOutput, findOutputKey, isValidationData, listOutputs, removeOutput, updateOutput } from '../../src/core/predictionItems.js'
import { findObservationsAt, moveExperiment, removeExperiment, removeSubExperiment, addSubExperiment } from '../../src/core/protocolEditing.js'
import { readPredictionItemsAsCircAutogen, validatePredictionItems } from '../../src/core/predictionValidation.js'

const RESOURCES = join(__dirname, '../resources')
const readFixture = (fileName) => JSON.parse(readFileSync(join(RESOURCES, fileName), 'utf8'))

// The peak sodium current early in each step, as the editor writes it.
const I_PEAK = {
  name: 'I_peak',
  operands: ['i_Na/i_Na'],
  unit: 'uA_per_cm2',
  experiments: [0, 1],
  subexperiment: 1,
  operation: 'min_in_range',
  operationKwargs: { start_frac: 0, end_frac: 0.2 },
  traceName: 'Sodium current',
}
const DOCUMENT = {
  protocol_info: { pre_times: [0, 0, 0], sim_times: [[1, 2], [3, 4], [5]], params_to_change: {}, experiment_labels: ['Control', 'Half g_Na', ' Wash-out!'] },
  data_items: [{ data_item_name: 'V_rest', data_type: 'constant', unit: 'mV', operands: ['membrane/V'], value: -80, std: 1 }],
}

/**
 * Lists a document's prediction items as `[name, experiment, sub-experiment]`.
 *
 * @param {Object} document
 * @returns {Array}
 */
const placesOf = (document) => document.prediction_items.map((item) => [item.data_item_name, item.experiment_idx, item.subexperiment_idx])

describe('addOutput', () => {
  it('writes one item per experiment, named with its label, as CA #536 reads it', () => {
    const before = JSON.stringify(DOCUMENT)
    const edited = addOutput(DOCUMENT, I_PEAK)
    expect(JSON.stringify(DOCUMENT)).toBe(before)
    expect(edited.prediction_items).toEqual([
      {
        data_item_name: 'I_peak_Control',
        operands: ['i_Na/i_Na'],
        unit: 'uA_per_cm2',
        operation: 'min_in_range',
        operation_kwargs: { start_frac: 0, end_frac: 0.2 },
        experiment_idx: 0,
        subexperiment_idx: 1,
        item_name_for_plotting: 'I_peak',
        trace_name_for_plotting: 'Sodium current',
      },
      { ...edited.prediction_items[0], data_item_name: 'I_peak_Half_g_Na', experiment_idx: 1 },
    ])
    expect(edited.protocol_info).toEqual(DOCUMENT.protocol_info)
    expect(edited.data_items).toEqual(DOCUMENT.data_items)
    expect(readPredictionItemsAsCircAutogen(edited).error).toBeNull()
  })

  it('names an item for one experiment as the output, and never as another item', () => {
    const trace = { name: 'V_rest', operands: ['membrane/V'], unit: 'mV', experiments: [2] }
    let edited = addOutput(DOCUMENT, trace)
    // A trace: no operation, and over the experiment's last sub-experiment.
    expect(edited.prediction_items).toEqual([{ data_item_name: 'V_rest_2', operands: ['membrane/V'], unit: 'mV', experiment_idx: 2, item_name_for_plotting: 'V_rest' }])
    edited = addOutput(edited, trace)
    expect(edited.prediction_items.map((item) => item.data_item_name)).toEqual(['V_rest_2', 'V_rest_3'])
  })

  it('names items by place when experiments share a label or have none', () => {
    const shared = { ...DOCUMENT, protocol_info: { ...DOCUMENT.protocol_info, experiment_labels: ['Control', 'Half g_Na', 'Control'] } }
    expect(placesOf(addOutput(shared, { ...I_PEAK, experiments: [1, 2], subexperiment: 0 }))).toEqual([
      ['I_peak_Half_g_Na', 1, 0],
      ['I_peak_e2', 2, 0],
    ])
    const unlabelled = { protocol_info: { pre_times: [0, 0], sim_times: [[1], [1]] } }
    expect(placesOf(addOutput(unlabelled, { ...I_PEAK, subexperiment: null }))).toEqual([
      ['I_peak_e0', 0, undefined],
      ['I_peak_e1', 1, undefined],
    ])
  })

  it('writes no operation_kwargs for none, nor an operation spelled as none', () => {
    const [item] = addOutput(DOCUMENT, { ...I_PEAK, experiments: [0], operation: 'max', operationKwargs: {} }).prediction_items
    expect(item).not.toHaveProperty('operation_kwargs')
    const [trace] = addOutput(DOCUMENT, { ...I_PEAK, experiments: [0], operation: 'None' }).prediction_items
    expect(trace).not.toHaveProperty('operation')
    expect(trace).not.toHaveProperty('operation_kwargs')
  })

  it('never writes measured data', () => {
    const [item] = addOutput(DOCUMENT, { ...I_PEAK, value: 1, std: 1, data_type: 'constant', obs_dt: 1 }).prediction_items
    expect(['value', 'std', 'data_type', 'obs_dt'].filter((key) => key in item)).toEqual([])
  })
})

describe('listOutputs', () => {
  it('groups the items of an output, and keeps validation data apart', () => {
    const outputs = listOutputs(readFixture('prediction_items_536_obs_data.json'))
    expect(outputs.map(({ key, kind, experiments, isValidationData: isData }) => [key, kind, experiments, isData])).toEqual([
      ['output:V_trace', 'trace', [0], false],
      ['output:i_Na_holding', 'trace', [0], false],
      ['output:I_peak', 'feature', [0, 1], false],
      ['output:V_step', 'feature', [1], false],
      ['data:I_late_e1', 'feature', [1], true],
    ])
    const peak = outputs[2]
    expect(peak).toMatchObject({ name: 'I_peak', operands: ['i_Na/i_Na'], operation: 'min_in_range', operationKwargs: { start_frac: 0, end_frac: 0.2 }, subexperiment: 1, isUniform: true })
    expect(peak.items).toEqual([
      { index: 2, name: 'I_peak_e0', experiment: 0, subexperiment: 1 },
      { index: 3, name: 'I_peak_e1', experiment: 1, subexperiment: 1 },
    ])
  })

  it('says when the items of an output differ in more than their experiment', () => {
    const document = { prediction_items: [{ data_item_name: 'a', item_name_for_plotting: 'x', operands: ['m/v'], unit: 'mV' }, { data_item_name: 'b', item_name_for_plotting: 'x', operands: ['m/w'], unit: 'mV', experiment_idx: 1 }] }
    expect(listOutputs(document)[0].isUniform).toBe(false)
    expect(listOutputs(null)).toEqual([])
    expect(listOutputs([{ data_item_name: 'bare' }])).toEqual([])
  })

  it('tells validation data by its measured data', () => {
    expect(isValidationData({ data_item_name: 'a' })).toBe(false)
    expect(isValidationData({ data_item_name: 'a', value: null })).toBe(false)
    expect(['value', 'std', 'data_type', 'obs_dt'].map((key) => isValidationData({ [key]: 0 }))).toEqual([true, true, true, true])
    expect(findOutputKey({ data_item_name: 'a', item_name_for_plotting: 'b', data_type: 'series' })).toBe('data:b')
  })
})

describe('updateOutput and removeOutput', () => {
  const document = addOutput(addOutput(DOCUMENT, { name: 'V', operands: ['membrane/V'], unit: 'mV', experiments: [0] }), I_PEAK)

  it('changes an output in place, its items keeping their names', () => {
    const edited = updateOutput(document, 'output:I_peak', { operation: 'max_in_range', operationKwargs: { start_frac: 0.1, end_frac: 0.5 } })
    expect(placesOf(edited)).toEqual(placesOf(document))
    expect(edited.prediction_items.slice(1).map((item) => [item.operation, item.operation_kwargs])).toEqual([
      ['max_in_range', { start_frac: 0.1, end_frac: 0.5 }],
      ['max_in_range', { start_frac: 0.1, end_frac: 0.5 }],
    ])
    expect(edited.prediction_items[1].trace_name_for_plotting).toBe('Sodium current')
  })

  it('adds and drops experiments, naming only the new items', () => {
    let edited = updateOutput(document, 'output:I_peak', { experiments: [1, 2], subexperiment: 0 })
    expect(placesOf(edited)).toEqual([
      ['V', 0, undefined],
      ['I_peak_Half_g_Na', 1, 0],
      ['I_peak_Wash_out', 2, 0],
    ])
    // An item named for its one experiment is named for it once the output has several.
    edited = updateOutput(edited, 'output:V', { experiments: [0, 1] })
    expect(placesOf(edited).slice(0, 2)).toEqual([
      ['V_Control', 0, undefined],
      ['V_Half_g_Na', 1, undefined],
    ])
  })

  it('renames an output, and its items with it', () => {
    const edited = updateOutput(document, 'output:I_peak', { name: 'I_min' })
    expect(placesOf(edited).slice(1).map(([name]) => name)).toEqual(['I_min_Control', 'I_min_Half_g_Na'])
    expect(listOutputs(edited).map(({ key }) => key)).toEqual(['output:V', 'output:I_min'])
  })

  it('removes an output', () => {
    expect(placesOf(removeOutput(document, 'output:I_peak'))).toEqual([['V', 0, undefined]])
  })

  it('never changes or removes validation data', () => {
    const fixture = readFixture('prediction_items_536_obs_data.json')
    expect(updateOutput(fixture, 'data:I_late_e1', { unit: 'mA' })).toBe(fixture)
    expect(removeOutput(fixture, 'data:I_late_e1')).toBe(fixture)
    expect(removeOutput(fixture, 'output:nothing')).toBe(fixture)
  })
})

describe('outputs through edits of the protocol', () => {
  // Experiment 1 has a validation item of its own; the outputs record over named and last sub-experiments.
  const document = addOutput(
    addOutput({ ...DOCUMENT, prediction_items: [{ data_item_name: 'I_late', operands: ['i_Na/i_Na'], unit: 'uA_per_cm2', operation: 'max', experiment_idx: 1, data_type: 'constant', value: -0.5, std: 0.1 }] }, I_PEAK),
    { name: 'V', operands: ['membrane/V'], unit: 'mV', experiments: [0, 1, 2] }
  )

  it('moves outputs with their experiments', () => {
    const moved = moveExperiment(document, 0, 2)
    expect(placesOf(moved)).toEqual([
      ['I_late', 0, undefined],
      ['I_peak_Control', 2, 1],
      ['I_peak_Half_g_Na', 0, 1],
      ['V_Control', 2, undefined],
      ['V_Half_g_Na', 0, undefined],
      ['V_Wash_out', 1, undefined],
    ])
    // Only places change: the validation item's data, and each output's definition, stay.
    expect(moved.prediction_items[0]).toEqual({ ...document.prediction_items[0], experiment_idx: 0 })
    expect(listOutputs(moved).map(({ key, experiments }) => [key, experiments])).toEqual([
      ['data:I_late', [0]],
      ['output:I_peak', [2, 0]],
      ['output:V', [2, 0, 1]],
    ])
  })

  it('drops the items of a removed experiment, renumbering the rest', () => {
    expect(findObservationsAt(document, 1)).toEqual(['I_late', 'I_peak_Half_g_Na', 'V_Half_g_Na'])
    expect(placesOf(removeExperiment(document, 1))).toEqual([
      ['I_peak_Control', 0, 1],
      ['V_Control', 0, undefined],
      ['V_Wash_out', 1, undefined],
    ])
  })

  it('drops the items of a removed sub-experiment, and those recording over the last follow it', () => {
    expect(findObservationsAt(document, 0, 1)).toEqual(['I_peak_Control'])
    expect(placesOf(removeSubExperiment(document, 0, 1)).slice(0, 3)).toEqual([
      ['I_late', 1, undefined],
      ['I_peak_Half_g_Na', 1, 1],
      ['V_Control', 0, undefined],
    ])
    const shifted = removeSubExperiment(document, 1, 0)
    expect(placesOf(shifted)[2]).toEqual(['I_peak_Half_g_Na', 1, 0])
    expect(validatePredictionItems(shifted).errors).toEqual([])
    // A sub-experiment added after the one an output names leaves it there.
    expect(placesOf(addSubExperiment(document, 0))).toEqual(placesOf(document))
  })

  it('reads as CA #536 reads it after each edit', () => {
    for (const edited of [document, moveExperiment(document, 0, 2), removeExperiment(document, 0), removeSubExperiment(document, 1, 1)]) {
      expect(readPredictionItemsAsCircAutogen(edited).error).toBeNull()
    }
  })
})

describe('outputs in a CUFLynx file', () => {
  it('leave its protocol_info and data items as they were, byte for byte', () => {
    const text = readFileSync(join(RESOURCES, 'br-1977_obs_data.json'), 'utf8')
    const document = JSON.parse(text)
    let edited = addOutput(document, { name: 'V_peak', operands: ['membrane/V'], unit: 'mV', experiments: [0], operation: 'max' })
    edited = updateOutput(edited, 'output:V_peak', { operation: 'max_in_range', operationKwargs: { start_frac: 0.5, end_frac: 1 } })
    for (const key of Object.keys(document)) expect(JSON.stringify(edited[key])).toBe(JSON.stringify(document[key]))
    expect(Object.keys(edited)).toEqual([...Object.keys(document), 'prediction_items'])
    expect(JSON.stringify(removeOutput(edited, 'output:V_peak').protocol_info)).toBe(JSON.stringify(document.protocol_info))
  })
})
