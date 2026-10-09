/**
 * Computes the operations an output can take as circulatory_autogen's own funcs do (operation_funcs.py,
 * operation_funcs_user.py, numpy's math backend): the same samples, the same NaNs and errors, and means summed in
 * numpy's order, so each value is the one CA gives, to the last bit.
 */
import { formatPythonRepr } from './pythonFormat.js'

// numpy's pairwise summation: below 8 values a plain sum, up to its block of 128 eight running sums, else halves.
const UNROLL = 8
const BLOCK = 128
// The keyword arguments circulatory_autogen supplies itself, which operation_kwargs may not set.
const RESERVED_KWARGS = ['series_output']

/** An operation that can't be computed, as CA raises; `pythonType` names the error CA raises. */
export class OperationError extends Error {
  /**
   * @param {string} message
   * @param {string} [pythonType] - 'ValueError' or 'TypeError'.
   */
  constructor(message, pythonType = 'ValueError') {
    super(message)
    this.name = 'OperationError'
    this.pythonType = pythonType
  }
}

/**
 * Sums values in numpy's order (pairwise_sum, loops_utils.h), so a mean rounds as numpy's does.
 *
 * @param {ArrayLike<number>} values
 * @param {number} [start]
 * @param {number} [count]
 * @returns {number}
 */
export function sumPairwise(values, start = 0, count = values.length - start) {
  if (count < UNROLL) {
    let sum = 0
    for (let index = 0; index < count; index++) sum += values[start + index]
    return sum
  }
  if (count <= BLOCK) {
    const sums = Array.from({ length: UNROLL }, (_, lane) => values[start + lane])
    let index = UNROLL
    for (; index < count - (count % UNROLL); index += UNROLL) {
      for (let lane = 0; lane < UNROLL; lane++) sums[lane] += values[start + index + lane]
    }
    let sum = sums[0] + sums[1] + (sums[2] + sums[3]) + (sums[4] + sums[5] + (sums[6] + sums[7]))
    for (; index < count; index++) sum += values[start + index]
    return sum
  }
  let half = Math.trunc(count / 2)
  half -= half % UNROLL
  return sumPairwise(values, start, half) + sumPairwise(values, start + half, count - half)
}

/**
 * The mean of values as np.mean gives it: NaN for none. numpy's sum starts from 0, so negative zeros sum to 0.
 *
 * @param {ArrayLike<number>} values
 * @returns {number}
 */
export const computeMean = (values) => (0 + sumPairwise(values)) / values.length

/**
 * Reduces values to their greatest or least as np.max and np.min do: NaN when any is, an error when there are none.
 *
 * @param {ArrayLike<number>} values
 * @param {boolean} isMax
 * @returns {number}
 * @throws {OperationError} For no values.
 */
function reduceExtreme(values, isMax) {
  if (!values.length) throw new OperationError(`zero-size array to reduction operation ${isMax ? 'maximum' : 'minimum'} which has no identity`)
  let extreme = values[0]
  for (let index = 1; index < values.length; index++) extreme = isMax ? Math.max(extreme, values[index]) : Math.min(extreme, values[index])
  return extreme
}

const computeMax = (values) => reduceExtreme(values, true)
const computeMin = (values) => reduceExtreme(values, false)
const computeMaxMinusMin = (values) => computeMax(values) - computeMin(values)

/**
 * Reads a fraction as Python's `int(fraction * (n - 1))`: truncated towards 0, a bool as 0 or 1.
 *
 * @param {*} fraction
 * @param {number} last - n - 1.
 * @returns {number}
 * @throws {OperationError} For a fraction that isn't a finite number, as int() raises.
 */
function readIndex(fraction, last) {
  if (typeof fraction !== 'number' && typeof fraction !== 'boolean') {
    throw new OperationError(`The range's fraction must be a number, got ${formatPythonRepr(fraction)}.`, fraction == null ? 'TypeError' : 'ValueError')
  }
  const product = Number(fraction) * last
  if (!Number.isFinite(product)) throw new OperationError(`cannot convert float ${Number.isNaN(product) ? 'NaN' : 'infinity'} to integer`)
  return Math.trunc(product)
}

/**
 * Takes the samples `x[int(start_frac * (n - 1)):int(end_frac * (n - 1))]` as Python slices them: a negative index
 * counts from the end, and an index past either end stops there.
 *
 * @param {ArrayLike<number>} values
 * @param {Object} kwargs - With start_frac and end_frac; CA's defaults are 0 and 1.
 * @returns {ArrayLike<number>}
 */
export function sliceRange(values, { start_frac: startFrac = 0, end_frac: endFrac = 1 } = {}) {
  const count = values.length
  const clamp = (index) => Math.min(Math.max(index < 0 ? index + count : index, 0), count)
  const start = clamp(readIndex(startFrac, count - 1))
  const end = clamp(readIndex(endFrac, count - 1))
  return Array.prototype.slice.call(values, start, Math.max(start, end))
}

/**
 * Makes an operation over a range from one over all of a series.
 *
 * @param {Function} reduce
 * @returns {Function}
 */
const inRange =
  (reduce) =>
  (values, kwargs = {}) =>
    reduce(sliceRange(values, kwargs))

// The operations, by CA's names: each takes the series and its keyword arguments, and the keyword arguments each
// accepts.
const OPERATIONS = {
  max: { compute: computeMax, kwargs: [] },
  min: { compute: computeMin, kwargs: [] },
  mean: { compute: computeMean, kwargs: [] },
  max_minus_min: { compute: computeMaxMinusMin, kwargs: [] },
  max_in_range: { compute: inRange(computeMax), kwargs: ['start_frac', 'end_frac'] },
  min_in_range: { compute: inRange(computeMin), kwargs: ['start_frac', 'end_frac'] },
  mean_in_range: { compute: inRange(computeMean), kwargs: ['start_frac', 'end_frac'] },
  max_minus_min_in_range: { compute: inRange(computeMaxMinusMin), kwargs: ['start_frac', 'end_frac'] },
}
export const COMPUTED_OPERATIONS = Object.keys(OPERATIONS)

/**
 * Whether the kit computes an operation.
 *
 * @param {*} operation
 * @returns {boolean}
 */
export const isComputedOperation = (operation) => typeof operation === 'string' && Object.hasOwn(OPERATIONS, operation)

/**
 * Checks an item's operation_kwargs against its operation, as CA's check_operation_kwargs does.
 *
 * @param {string} operation
 * @param {Object} kwargs
 * @param {string} name - The item's data_item_name.
 * @throws {OperationError} With CA's message, but for its "Did you mean" hint.
 */
function checkKwargs(operation, kwargs, name) {
  const where = `data_item '${name}'`
  const accepted = OPERATIONS[operation].kwargs
  for (const key of Object.keys(kwargs)) {
    if (RESERVED_KWARGS.includes(key)) {
      throw new OperationError(
        `Invalid 'operation_kwargs' key '${key}' in ${where}: '${key}' is set by circulatory_autogen when it calls the operation func ` +
          `'${operation}' and must not be given in obs_data.json. Remove it from 'operation_kwargs'.`
      )
    }
    if (key === 'x') {
      throw new OperationError(
        `Invalid 'operation_kwargs' key 'x' in ${where}: the operation func '${operation}' already receives 'x' positionally from the ` +
          `data_item's 'operands' (operands fill ['x']). Remove 'x' from 'operation_kwargs', or remove the corresponding entry from 'operands'.`
      )
    }
    if (!accepted.includes(key)) {
      throw new OperationError(
        `Invalid 'operation_kwargs' key '${key}' in ${where}: the operation func '${operation}' has no keyword argument '${key}'. ` +
          `Accepted keyword arguments are: ${formatPythonRepr([...accepted, 'x'].sort())}. Fix the key in the data_item's ` +
          `'operation_kwargs' in obs_data.json, or add '${key}' as a keyword argument of '${operation}'.`
      )
    }
  }
}

/**
 * Applies an operation to an item's operands, as CA's evaluate_feature does: its operation_kwargs checked, those that
 * name an earlier item replaced by its value, then the operation over its one operand.
 *
 * @param {string} operation - One of COMPUTED_OPERATIONS.
 * @param {Array<ArrayLike<number>>} operands - Each operand's samples over the sub-experiment.
 * @param {Object} [kwargs] - The item's operation_kwargs.
 * @param {Object} [options]
 * @param {string} [options.name] - The item's data_item_name, for messages.
 * @param {Map<string, number>} [options.computed] - The values of the items computed before it, by name.
 * @param {Set<string>} [options.itemNames] - Every prediction item's name: one not yet computed can't be used.
 * @returns {number}
 * @throws {OperationError} Where CA raises.
 */
export function applyOperation(operation, operands, kwargs = {}, { name = 'item', computed = new Map(), itemNames = new Set() } = {}) {
  if (!isComputedOperation(operation)) throw new OperationError(`prediction item '${name}': operation ${formatPythonRepr(operation)} is not one protocol-kit computes.`)
  const raw = kwargs && typeof kwargs === 'object' && !Array.isArray(kwargs) ? kwargs : {}
  checkKwargs(operation, raw, name)
  const resolved = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && computed.has(value)) resolved[key] = computed.get(value)
    else if (typeof value === 'string' && itemNames.has(value)) {
      throw new OperationError(
        `data_item '${name}': 'operation_kwargs' key '${key}' references data_item '${value}', which has not been computed yet. ` +
          `References are resolved in order, so the item referenced must come earlier in 'data_items'.`
      )
    } else resolved[key] = value
  }
  if (operands.length !== 1) {
    throw new OperationError(`prediction item '${name}': ${operation} takes one operand, got ${operands.length}.`, 'TypeError')
  }
  return OPERATIONS[operation].compute(operands[0], resolved)
}
