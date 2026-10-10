/**
 * The vocabulary of an obs_data document's data_items, as circulatory_autogen #536 has it (obs_data_helpers.py, its
 * operation and cost funcs): the data types, plot types and default cost type, and the operations and cost funcs with
 * the operands and keyword arguments each takes, for an editor to offer. A host that knows its CA's own, user funcs
 * included, gives that instead (readObsDataOptions reads CUFLynx's).
 */
import { isMapping } from './protocolShapes.js'

// CA's VALID_DATA_TYPES: `timeseries` is an old spelling of series, and `prob_dist` is gone (a constant with a cost
// that scores against a distribution).
export const DATA_TYPES = ['constant', 'series', 'frequency']
// CA's VALID_PLOT_TYPES; 'None', or no plot_type for a series or a frequency, draws no marker.
export const PLOT_TYPES = ['horizontal', 'vertical', 'horizontal_from_min', 'series', 'frequency']
// What CA scores an item by when it names no cost_type, and what it did before #392.
export const DEFAULT_COST_TYPE = 'gaussian_MLE'
export const PREVIOUS_DEFAULT_COST_TYPE = 'MSE'
// The keyword arguments CA gives an operation and a cost func itself, which an item's kwargs may not set.
export const RESERVED_OPERATION_KWARGS = ['series_output']
export const RESERVED_COST_KWARGS = ['std', 'weight']

/**
 * Describes a keyword argument for an editor: a boolean, number or string as its default is, else another item's name
 * for an operation of no operands, which CA resolves to that item's value, else a number.
 *
 * @param {string} name
 * @param {*} value - Its default.
 * @param {boolean} [takesNoOperands]
 * @returns {{name: string, default: *, type: 'boolean'|'number'|'string'|'data_item'}}
 */
function describeKwarg(name, value, takesNoOperands = false) {
  const type = typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : typeof value === 'string' ? 'string' : takesNoOperands ? 'data_item' : 'number'
  return { name, default: value, type }
}

/**
 * Describes one of CA's operations.
 *
 * @param {string} name
 * @param {string[]} operands - The arguments it fills from an item's operands, in order.
 * @param {Object} [kwargs] - Its keyword arguments and their defaults.
 * @param {boolean} [differentiable] - Whether CA marks it @differentiable.
 * @returns {Object}
 */
const operation = (name, operands, kwargs = {}, differentiable = false) => ({
  name,
  operands,
  kwargs: Object.entries(kwargs).map(([kwarg, value]) => describeKwarg(kwarg, value, !operands.length)),
  acceptsAny: false,
  differentiable,
})

// The windows of a range, and the threshold and spacing of spikes.
const RANGE = { start_frac: 0, end_frac: 1 }
const SPIKES = { spike_min_thresh: null, distance: null }

// CA's operations (operation_funcs.py, operation_funcs_user.py), by name.
export const DATA_ITEM_OPERATIONS = [
  operation('AHP_minus_steady_state_min', ['t', 'V'], { spike_min_thresh: null }),
  operation('E_A_ratio', ['t', 'x', 'T']),
  operation('V_plateau', ['t', 'V'], { ...SPIKES, dV_dt_thresh: 10000 }),
  operation('abs_diff_start_to_last_quarter', ['x'], {}, true),
  operation('addition', ['x1', 'x2'], {}, true),
  operation('calc_AHP_duration', ['t', 'V'], { baseline_voltage: null }),
  operation('calc_min_peak', ['t', 'V'], { spike_min_thresh: null }),
  operation('calc_min_to_max_period_diff', ['t', 'V'], { spike_min_thresh: null }),
  operation('calc_spike_count_windowed', ['t', 'V'], { spike_min_thresh: -10, ...RANGE }),
  operation('calc_spike_frequency_windowed', ['t', 'V'], { spike_min_thresh: -10, ...RANGE }),
  operation('calc_spike_period', ['t', 'V']),
  operation('calculate_two_observable_difference', [], { subtract_from: null, subtract_this: null }),
  operation('division', ['x1', 'x2'], {}, true),
  operation('first_minus_second_over_third_in_range', ['first', 'second', 'third'], {}, true),
  operation('first_peak_time', ['t', 'V'], { spike_min_thresh: null }),
  operation('first_peak_time_from_subexp_start', ['t', 'V'], { spike_min_thresh: null }),
  operation('first_period', ['t', 'V'], SPIKES),
  operation('max', ['x'], {}, true),
  operation('max_first_half', ['x'], { start_frac: 0, end_frac: 0.5 }),
  operation('max_in_range', ['x'], RANGE, true),
  operation('max_minus_mean_in_range', ['x'], RANGE, true),
  operation('max_minus_min', ['x'], {}, true),
  operation('max_minus_min_divided_by_mean_in_range', ['x'], RANGE, true),
  operation('max_minus_min_in_range', ['x'], RANGE, true),
  operation('max_minus_min_over_mean_in_range', ['x'], RANGE, true),
  operation('mean', ['x'], {}, true),
  operation('mean_AP_threshold', ['t', 'V'], { ...SPIKES, dV_dt_thresh: 10000 }),
  operation('mean_in_range', ['x'], RANGE, true),
  operation('mean_in_range_fraction_change_from_initial', ['x'], { start_frac: 0.8, end_frac: 1 }, true),
  operation('mean_in_range_fraction_change_from_initial_range', ['x'], { start_frac: 0.8, end_frac: 1, init_range_end_frac: 0.1 }, true),
  operation('mean_in_range_minus_initial', ['x'], { start_frac: 0.8, end_frac: 1 }, true),
  operation('mean_peak_to_trough_time', ['t', 'V'], SPIKES),
  operation('min', ['x'], {}, true),
  operation('min_between_first_two_spikes', ['t', 'V'], { spike_min_thresh: null }),
  operation('min_in_range', ['x'], RANGE, true),
  operation('min_period', ['t', 'V'], SPIKES),
  operation('multiplication', ['x1', 'x2'], {}, true),
  operation('peak_times', ['t', 'V']),
  operation('second_period', ['t', 'V'], SPIKES),
  operation('steady_state_avg', ['x'], {}, true),
  operation('steady_state_min', ['x'], {}, true),
  operation('subtraction', ['x1', 'x2'], {}, true),
]

/**
 * Describes one of CA's cost funcs.
 *
 * @param {string} name
 * @param {string[]} positional - The arguments it fills itself: the model's output and the ground truth.
 * @param {Object} kwargs - Its keyword arguments and their defaults.
 * @param {Object} flags
 * @param {boolean} [flags.isMLE]
 * @param {boolean} [flags.isCombiner] - It combines items' costs rather than scoring one.
 * @param {boolean} [flags.differentiable]
 * @param {boolean} [flags.acceptsAny] - It takes **kwargs.
 * @returns {Object} `groundTruth` is 'distribution' for one scored against an item's prob_dist_params, else 'value'.
 */
const costType = (name, positional, kwargs, { isMLE = false, isCombiner = false, differentiable = false, acceptsAny = false }) => ({
  name,
  positional,
  kwargs: Object.entries(kwargs).map(([kwarg, value]) => describeKwarg(kwarg, value)),
  acceptsAny,
  groundTruth: positional[1] === 'prob_dist_params' ? 'distribution' : 'value',
  isMLE,
  isCombiner,
  differentiable,
})

const VALUE = ['output', 'desired_mean']
const DISTRIBUTION = ['output', 'prob_dist_params']

// CA's cost funcs (cost_funcs_user.py), by name.
export const DATA_ITEM_COST_TYPES = [
  costType('AE', VALUE, {}, { differentiable: true }),
  costType('MSE', [], {}, { differentiable: true, acceptsAny: true }),
  costType('additive', ['costs'], {}, { isMLE: true, isCombiner: true, differentiable: true }),
  costType('com_poisson_MLE', DISTRIBUTION, { nu: 1, background_rate: 0 }, { isMLE: true }),
  costType('gaussian_MLE', VALUE, {}, { isMLE: true, differentiable: true }),
  costType('gaussian_MLE_robust', VALUE, { p_outlier: 0, outlier_width: 170 }, { isMLE: true, differentiable: true }),
  costType('kernel_density_estimation', DISTRIBUTION, { bandwidth: 'scott' }, { isMLE: true }),
  costType('multimodal_gaussian', DISTRIBUTION, {}, { isMLE: true }),
  costType('norm_additive', ['costs'], {}, { isCombiner: true, differentiable: true }),
  costType('poisson_MLE', DISTRIBUTION, { background_rate: 0 }, { isMLE: true }),
]

// What an editor offers by default: CA #536's own funcs, but not the cost funcs that combine other costs.
export const DATA_ITEM_VOCABULARY = {
  dataTypes: DATA_TYPES,
  plotTypes: PLOT_TYPES,
  defaultCostType: DEFAULT_COST_TYPE,
  operations: DATA_ITEM_OPERATIONS,
  costTypes: DATA_ITEM_COST_TYPES.filter(({ isCombiner }) => !isCombiner),
}

/**
 * Reads a keyword argument of CUFLynx's options. CUFLynx calls one whose default is None a string, which an editor
 * would write as text, so its type is worked out as CA's own are (describeKwarg).
 *
 * @param {{name: string, default: *, type: string}} kwarg
 * @param {boolean} takesNoOperands
 * @returns {{name: string, default: *, type: string}}
 */
function readOptionKwarg({ name, default: value, type }, takesNoOperands) {
  if (type === 'integer') return { name, default: value ?? null, type: 'number' }
  if (type === 'string' && typeof value !== 'string') return describeKwarg(name, value ?? null, takesNoOperands)
  return { name, default: value ?? null, type }
}

/**
 * Reads the options CUFLynx's API gives its obs_data editor (`GET /api/obs_data/options`: its CA's funcs, the user's
 * included) as a vocabulary the editor takes. What it leaves out is CA #536's.
 *
 * @param {Object} options
 * @returns {Object} As DATA_ITEM_VOCABULARY.
 */
export function readObsDataOptions(options) {
  if (!isMapping(options)) return DATA_ITEM_VOCABULARY
  const listOr = (value, fallback) => (Array.isArray(value) && value.length ? value : fallback)
  const mapping = (value) => (isMapping(value) ? value : {})
  const builtIn = (list, name) => list.find((entry) => entry.name === name)
  const operandsOf = mapping(options.operation_operands)
  const kwargsOf = mapping(options.operation_kwargs_schema)
  const differentiable = mapping(options.differentiable_operations)
  const operations = listOr(options.operations, null)
    ?.filter((name) => name)
    .map((name) => {
      const own = builtIn(DATA_ITEM_OPERATIONS, name)
      const operands = operandsOf[name]
      const names = Array.isArray(operands?.names) ? operands.names : (own?.operands ?? [])
      return {
        name,
        operands: names,
        kwargs: Array.isArray(kwargsOf[name]) ? kwargsOf[name].map((kwarg) => readOptionKwarg(kwarg, !names.length)) : (own?.kwargs ?? []),
        acceptsAny: !!operands?.variadic,
        differentiable: name in differentiable ? !!differentiable[name] : !!own?.differentiable,
      }
    })
  const costKwargsOf = mapping(options.cost_kwargs_schema)
  const acceptsAny = mapping(options.cost_kwargs_accepts_any)
  const metadata = mapping(options.cost_func_metadata)
  const costTypes = listOr(options.cost_types, null)?.flatMap((name) => {
    const own = builtIn(DATA_ITEM_COST_TYPES, name)
    const flags = mapping(metadata[name])
    if (flags.is_combiner ?? own?.isCombiner) return []
    const kwargs = Array.isArray(costKwargsOf[name]) ? costKwargsOf[name].map(({ name: kwarg, default: value }) => describeKwarg(kwarg, value ?? null)) : (own?.kwargs ?? [])
    return [
      {
        name,
        positional: own?.positional ?? [],
        kwargs,
        acceptsAny: name in acceptsAny ? !!acceptsAny[name] : (own?.acceptsAny ?? true),
        groundTruth: own?.groundTruth ?? 'value',
        isMLE: !!(flags.is_MLE ?? own?.isMLE),
        isCombiner: false,
        differentiable: !!(flags.differentiable ?? own?.differentiable),
      },
    ]
  })
  return {
    dataTypes: listOr(options.data_types, DATA_TYPES).filter((type) => type !== 'prob_dist'),
    plotTypes: listOr(options.plot_types, PLOT_TYPES).filter((type) => type),
    defaultCostType: typeof options.default_cost_type === 'string' && options.default_cost_type ? options.default_cost_type : DEFAULT_COST_TYPE,
    operations: operations ?? DATA_ITEM_OPERATIONS,
    costTypes: costTypes ?? DATA_ITEM_VOCABULARY.costTypes,
  }
}
