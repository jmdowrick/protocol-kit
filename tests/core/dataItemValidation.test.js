import { describe, expect, it } from 'vitest'

import { checkDataItemReferences, findCloseMatches, validateDataItems } from '../../src/core/dataItemValidation.js'
import { DATA_ITEM_OPERATIONS, DATA_ITEM_VOCABULARY, readObsDataOptions } from '../../src/core/dataItemVocabulary.js'

const PROTOCOL_INFO = { pre_times: [0, 0], sim_times: [[1, 2], [3]], params_to_change: {} }
const PEAK = { data_item_name: 'V_peak', data_type: 'constant', unit: 'mV', operands: ['membrane/V'], operation: 'max', value: 20, std: 1.5 }

/**
 * Checks data items in a document with the protocol_info above.
 *
 * @param {Array<Object>} dataItems
 * @param {Object} [rest] - Other keys of the document.
 * @returns {Object} As validateDataItems gives.
 */
const check = (dataItems, rest = {}) => validateDataItems({ protocol_info: PROTOCOL_INFO, ...rest, data_items: dataItems })

describe('validateDataItems', () => {
  it('finds nothing wrong with good items, or with none', () => {
    expect(check([PEAK, { ...PEAK, data_item_name: 'V_min', operation: 'min' }]).errors).toEqual([])
    expect(validateDataItems({ protocol_info: PROTOCOL_INFO })).toEqual({ errors: [], warnings: [], itemErrors: [], itemWarnings: [], sharedErrors: [] })
  })

  it("gives each item CA's own error, and goes on to the next", () => {
    const { itemErrors, errors } = check([{ ...PEAK, unit: 1 }, { ...PEAK, data_item_name: 'b', data_type: 'scalar' }])
    expect(itemErrors[0]).toEqual(["Invalid data_item value types:\nrow 0, column 'unit': expected (<class 'str'>,), got <class 'int'>"])
    expect(itemErrors[1]).toEqual(["Unknown data_item data_type(s) ['scalar']. Valid data_types: ['constant', 'series', 'frequency']."])
    expect(errors).toHaveLength(2)
  })

  it('refuses an experiment or sub-experiment the protocol has not', () => {
    const { itemErrors } = check([
      { ...PEAK, experiment_idx: 2, subexperiment_idx: 0 },
      { ...PEAK, data_item_name: 'b', experiment_idx: 1, subexperiment_idx: 1 },
    ])
    expect(itemErrors).toEqual([
      ["data_items[0] ('V_peak'): experiment_idx 2 is not an experiment of protocol_info, which has 2."],
      ["data_items[1] ('b'): subexperiment_idx 1 is not a sub-experiment of experiment 1, which has 1."],
    ])
  })

  it("checks operation_kwargs and cost_kwargs against CA's funcs", () => {
    const { itemErrors } = check([
      { ...PEAK, operation: 'max_in_range', operation_kwargs: { star_frac: 0.1 } },
      { ...PEAK, data_item_name: 'b', cost_type: 'gaussian_MLE_robust', cost_kwargs: { std: 1 } },
    ])
    expect(itemErrors[0][0]).toMatch(/^Invalid 'operation_kwargs' key 'star_frac' in data_item 'V_peak'.* Did you mean 'start_frac'\?/)
    expect(itemErrors[1]).toEqual([
      "Invalid 'cost_kwargs' key 'std' in data_item 'b': 'std' is supplied by circulatory_autogen from the obs data and must not be set here. Set the data_item's own 'std' field instead.",
    ])
  })

  it('checks cost_kwargs against the default cost when an item names none', () => {
    expect(check([{ ...PEAK, cost_kwargs: { tolerance: 1 } }]).itemErrors[0][0]).toMatch(/cost func 'gaussian_MLE' has no parameter 'tolerance'/)
  })

  it('warns of an operation or cost func CA has not, and of kwargs with no operation', () => {
    const { itemWarnings, errors } = check([
      { ...PEAK, operation: 'mine', cost_type: 'yours' },
      { ...PEAK, data_item_name: 'b', operation: 'None', operation_kwargs: { a: 1 } },
    ])
    expect(errors).toEqual([])
    expect(itemWarnings).toEqual([
      [
        "data_items[0] ('V_peak'): circulatory_autogen has no operation 'mine' of its own; it needs an operation func of that name.",
        "data_items[0] ('V_peak'): circulatory_autogen has no cost func 'yours' of its own; it needs a cost func of that name.",
      ],
      ["data_items[1] ('b') has operation_kwargs but no operation, so circulatory_autogen doesn't use them. Name the operation, or drop operation_kwargs."],
    ])
  })

  it("takes the host's vocabulary, its own funcs included", () => {
    const vocabulary = readObsDataOptions({ operations: ['max', 'mine'], operation_operands: { mine: { names: ['x'], variadic: false } } })
    expect(validateDataItems({ protocol_info: PROTOCOL_INFO, data_items: [{ ...PEAK, operation: 'mine' }] }, { vocabulary }).warnings).toEqual([])
  })

  it("refuses a constant's std of 0, but not one scored against a distribution", () => {
    expect(check([{ ...PEAK, std: 0 }]).itemErrors[0]).toEqual(["data_items[0] ('V_peak'): every 'std' entry must be finite and > 0, got 0."])
    expect(check([{ ...PEAK, std: 0, cost_type: 'kernel_density_estimation', prob_dist_params: { samples: [1] } }]).errors).toEqual([])
  })

  it('refuses names repeated across data and prediction items, once for all', () => {
    const { sharedErrors, itemErrors } = check([PEAK, PEAK], { prediction_items: [{ data_item_name: 'V_peak', operands: ['membrane/V'], unit: 'mV' }] })
    expect(itemErrors).toEqual([[], []])
    expect(sharedErrors).toHaveLength(1)
    expect(sharedErrors[0]).toMatch(/^Duplicate 'data_item_name' in obs_data: 'V_peak' x3 \(in data_items, prediction_items\)/)
  })

  it('refuses what CA refuses of the items together: an index on some items only', () => {
    expect(check([{ ...PEAK, experiment_idx: 1 }, { ...PEAK, data_item_name: 'b' }]).sharedErrors[0]).toMatch(/^Invalid data_item value types:\nrow 0, column 'experiment_idx'/)
  })

  it('refuses data_items that are not a list', () => {
    expect(validateDataItems({ data_items: {} }).sharedErrors).toEqual(["data_items must be a list of dict entries, got <class 'dict'>"])
  })
})

describe('checkDataItemReferences', () => {
  const difference = (name, from, to, rest = {}) => ({ ...PEAK, data_item_name: name, operands: [], operation: 'calculate_two_observable_difference', operation_kwargs: { subtract_from: from, subtract_this: to }, ...rest })

  it('passes references to items computed earlier, in an earlier segment or before it in the same', () => {
    expect(checkDataItemReferences([PEAK, { ...PEAK, data_item_name: 'V_min', operation: 'min' }, difference('d', 'V_peak', 'V_min')])).toEqual([])
    expect(checkDataItemReferences([difference('d', 'V_peak', 'V_peak', { experiment_idx: 1 }), { ...PEAK, experiment_idx: 0 }])).toEqual([])
  })

  it('refuses one to an item computed later, or not computed at all', () => {
    const errors = checkDataItemReferences([difference('d', 'V_peak', 'V_peak'), PEAK, { ...PEAK, data_item_name: 'raw', operation: null }, difference('e', 'raw', 'raw')])
    expect(errors.map(({ index }) => index)).toEqual([0, 3])
    expect(errors[0].error).toMatch(/^data_item 'd': 'operation_kwargs' key 'subtract_from' references data_item 'V_peak', which has not been computed yet\..* Move 'V_peak' before 'd'\.$/)
  })

  it('leaves alone a string naming no item', () => {
    expect(checkDataItemReferences([{ ...PEAK, operation: 'max_in_range', operation_kwargs: { start_frac: '0.5' } }])).toEqual([])
  })
})

describe('findCloseMatches', () => {
  it("finds the words close to one, as difflib's get_close_matches does", () => {
    expect(findCloseMatches('star_frac', ['start_frac', 'end_frac', 'x'])).toEqual(['start_frac'])
    expect(findCloseMatches('apple', ['ape', 'apple', 'peach', 'puppy'])).toEqual(['apple', 'ape'])
    expect(findCloseMatches('zzz', ['start_frac'])).toEqual([])
  })
})

describe('readObsDataOptions', () => {
  it("reads CUFLynx's options, leaving out the combining cost funcs, and falls back on CA #536's", () => {
    const vocabulary = readObsDataOptions({
      operations: ['max', 'mine'],
      operation_operands: { mine: { names: ['t', 'V'], variadic: false } },
      operation_kwargs_schema: { mine: [{ name: 'threshold', default: 0, type: 'integer' }] },
      cost_types: ['MSE', 'additive', 'custom'],
      cost_func_metadata: { custom: { is_MLE: true } },
      default_cost_type: 'MSE',
      data_types: ['constant', 'series', 'frequency', 'prob_dist'],
    })
    expect(vocabulary.operations.map(({ name, operands }) => [name, operands])).toEqual([
      ['max', ['x']],
      ['mine', ['t', 'V']],
    ])
    expect(vocabulary.operations[1].kwargs).toEqual([{ name: 'threshold', default: 0, type: 'number' }])
    expect(vocabulary.costTypes.map(({ name, isMLE, acceptsAny }) => [name, isMLE, acceptsAny])).toEqual([
      ['MSE', false, true],
      ['custom', true, true],
    ])
    expect(vocabulary.defaultCostType).toBe('MSE')
    expect(vocabulary.dataTypes).toEqual(['constant', 'series', 'frequency'])
    expect(readObsDataOptions(null)).toBe(DATA_ITEM_VOCABULARY)
  })

  it('reads a kwarg CUFLynx calls a string for its None default as CA #536 does: a number, or an item for no operands', () => {
    const vocabulary = readObsDataOptions({
      operations: ['AHP_minus_steady_state_min', 'difference', 'labelled'],
      operation_operands: { difference: { names: [], variadic: false } },
      operation_kwargs_schema: {
        AHP_minus_steady_state_min: [{ name: 'spike_min_thresh', default: null, type: 'string' }],
        difference: [{ name: 'subtract_from', default: null, type: 'data_item' }, { name: 'other', default: null, type: 'string' }],
        labelled: [{ name: 'label', default: 'peak', type: 'string' }, { name: 'is_on', default: true, type: 'boolean' }],
      },
    })
    expect(vocabulary.operations.map(({ kwargs }) => kwargs.map(({ name, type }) => [name, type]))).toEqual([
      [['spike_min_thresh', 'number']],
      [
        ['subtract_from', 'data_item'],
        ['other', 'data_item'],
      ],
      [
        ['label', 'string'],
        ['is_on', 'boolean'],
      ],
    ])
    expect(vocabulary.operations[0].kwargs).toEqual(DATA_ITEM_OPERATIONS.find(({ name }) => name === 'AHP_minus_steady_state_min').kwargs)
  })
})
