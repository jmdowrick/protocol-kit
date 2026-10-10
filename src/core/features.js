/**
 * Computes the features of a run, as circulatory_autogen #536 does (prediction_features.py): each prediction item with
 * an operation that gives one number, over the samples its sub-experiment recorded.
 */
import { OperationError, applyOperation, sliceRange } from './operations.js'
import { isRangeOperation, readOperation, readPredictionItem } from './predictionValidation.js'
import { isMapping } from './protocolShapes.js'

/**
 * Reads an operand's samples in a sub-experiment. A constant, a number or one sample, is one sample, as libcuflynx's
 * Myokit helper gives a variable it doesn't log.
 *
 * @param {Object} segment - `{time, values}`.
 * @param {string} operand
 * @returns {ArrayLike<number>|null} Null when it wasn't recorded.
 */
function readOperand(segment, operand) {
  const values = segment.values?.[operand]
  if (typeof values === 'number') return [values]
  return values != null && typeof values.length === 'number' ? values : null
}

/**
 * Whether an operation's range takes no samples: a mean over none is NaN, where a maximum or minimum raises.
 *
 * @param {string} operation
 * @param {ArrayLike<number>} values
 * @param {Object} kwargs
 * @param {Map<string, number>} computed - The features before it, by name, which a fraction may name.
 * @returns {boolean}
 */
function isEmptyRange(operation, values, kwargs, computed) {
  if (!isRangeOperation(operation)) return false
  const resolved = Object.fromEntries(Object.entries(kwargs ?? {}).map(([key, value]) => [key, computed.has(value) ? computed.get(value) : value]))
  try {
    return sliceRange(values, resolved).length === 0
  } catch (error) {
    if (error instanceof OperationError) return false
    throw error
  }
}

/**
 * Computes a run's features: each prediction item with an operation that isn't a series, over its sub-experiment (its
 * subexperiment_idx, else its experiment's last), in the order of prediction_items, as CA's features_from_segments
 * does. An operation_kwargs value naming an earlier feature is its value.
 *
 * Each sub-experiment's samples are its own, as CA records them: from the one taken once its values are set, to its
 * end. A run that joins its sub-experiments into one trace must split them so.
 *
 * @param {Object} document - The obs_data document.
 * @param {Array<Array<{time?: ArrayLike<number>, values: Object<string, ArrayLike<number>|number>}|null>>}
 *   segmentsByExperiment - `[experiment][sub]`: each operand's samples, by its name in `operands`. A sub-experiment
 *   that wasn't run is left out, or null.
 * @returns {Array<{index: number, name: string, group: string, experiment: number, subexperiment: number,
 *   operation: string, unit: string, value: number, error: string|null}>} By place in prediction_items. `group` is
 *   the item_name_for_plotting, as CA defaults it. `value` is NaN, and `error` says why, where CA raises or the
 *   sub-experiment wasn't run (CA gives NaN); a mean over no samples is NaN, as numpy's, with an error.
 */
export function computeFeatures(document, segmentsByExperiment) {
  const items = Array.isArray(document?.prediction_items) ? document.prediction_items : []
  const simTimes = document?.protocol_info?.sim_times
  const itemNames = new Set(items.filter(isMapping).map((item) => String(item.data_item_name ?? item.variable)))
  const computed = new Map()
  const features = []
  items.forEach((item, index) => {
    if (!isMapping(item) || readOperation(item.operation) == null || item.data_type === 'series') return
    const { error: readError, entry } = readPredictionItem(item, index, simTimes)
    const name = String(entry?.data_item_name ?? item.data_item_name ?? item.variable ?? '')
    const feature = {
      index,
      name,
      group: entry?.item_name_for_plotting ?? '',
      experiment: Number(entry?.experiment_idx ?? item.experiment_idx ?? 0),
      subexperiment: entry?.subexperiment_idx ?? null,
      operation: readOperation(item.operation),
      unit: entry?.unit ?? item.unit ?? '',
      value: NaN,
      error: readError,
    }
    features.push(feature)
    if (readError) return
    const segment = segmentsByExperiment?.[feature.experiment]?.[feature.subexperiment]
    if (!segment) {
      feature.error = `Sub-experiment ${feature.subexperiment + 1} of experiment ${feature.experiment + 1} wasn't run.`
      return
    }
    const operands = entry.operands.map((operand) => readOperand(segment, operand))
    const missing = entry.operands.filter((_, position) => !operands[position])
    if (missing.length) {
      feature.error = `${missing.join(', ')} ${missing.length === 1 ? "wasn't" : "weren't"} recorded.`
      return
    }
    try {
      feature.value = applyOperation(feature.operation, operands, entry.operation_kwargs, { name, computed, itemNames })
    } catch (error) {
      if (!(error instanceof OperationError)) throw error
      feature.error = error.message
      return
    }
    if (Number.isNaN(feature.value) && isEmptyRange(feature.operation, operands[0], entry.operation_kwargs, computed)) feature.error = 'Its range takes no samples.'
    computed.set(name, feature.value)
  })
  return features
}
