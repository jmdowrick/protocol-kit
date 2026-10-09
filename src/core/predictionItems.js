/**
 * Edits the outputs an obs_data document records: its prediction_items. An output is a variable's trace, or a
 * feature of it (an operation over a sub-experiment), in one or more experiments, written as one prediction item per
 * experiment that share an item_name_for_plotting. Items with measured data (value, std, data_type or obs_dt) are
 * validation data: listed, never changed here. Each edit gives a new document, keeping everything it doesn't touch.
 */
import { isMapping } from './protocolShapes.js'
import { readOperation } from './predictionValidation.js'

// The operations an output can take, from circulatory_autogen's own (operation_funcs.py, operation_funcs_user.py).
// Each gives one number, in the operand's unit. Those in a range take start_frac and end_frac.
export const OUTPUT_OPERATIONS = [
  { value: 'max', label: 'Maximum', hasRange: false },
  { value: 'min', label: 'Minimum', hasRange: false },
  { value: 'mean', label: 'Mean', hasRange: false },
  { value: 'max_minus_min', label: 'Maximum minus minimum', hasRange: false },
  { value: 'max_in_range', label: 'Maximum in a range', hasRange: true },
  { value: 'min_in_range', label: 'Minimum in a range', hasRange: true },
  { value: 'mean_in_range', label: 'Mean in a range', hasRange: true },
  { value: 'max_minus_min_in_range', label: 'Maximum minus minimum in a range', hasRange: true },
]
// The keys of measured data, which make an item validation data.
const DATA_KEYS = ['value', 'std', 'data_type', 'obs_dt']
// What an output's items have in common.
const DEFINITION_KEYS = ['operands', 'unit', 'operation', 'operation_kwargs', 'subexperiment_idx', 'trace_name_for_plotting']

/**
 * Copies a document as JSON, so edits never reach the one given.
 *
 * @param {*} document
 * @returns {*}
 */
const copy = (document) => JSON.parse(JSON.stringify(document))

/**
 * Whether a prediction item holds measured data to validate against, which the editor leaves as it is.
 *
 * @param {Object} item
 * @returns {boolean}
 */
export const isValidationData = (item) => DATA_KEYS.some((key) => item?.[key] != null)

/**
 * Names the output an item is part of: its item_name_for_plotting, else its own name.
 *
 * @param {Object} item
 * @returns {string}
 */
const nameGroup = (item) => String(item.item_name_for_plotting ?? item.data_item_name ?? '(unnamed)')

/**
 * Gives the key an output is known by: its name, and whether it is validation data, which never shares an output
 * with items the editor writes.
 *
 * @param {Object} item
 * @returns {string}
 */
export const findOutputKey = (item) => `${isValidationData(item) ? 'data' : 'output'}:${nameGroup(item)}`

/**
 * Lists a document's prediction items.
 *
 * @param {Object|Array|null} document
 * @returns {Array<Object>}
 */
const listItems = (document) => (isMapping(document) && Array.isArray(document.prediction_items) ? document.prediction_items : [])

/**
 * Lists a document's outputs: its prediction items grouped by item_name_for_plotting, or each by its own name when it
 * has none, in the order of their first items.
 *
 * @param {Object|Array|null} document
 * @returns {Array<{key: string, name: string, kind: 'trace'|'feature', operands: Array, unit: string,
 *   operation: string|null, operationKwargs: Object, subexperiment: number|null, traceName: string|null,
 *   isValidationData: boolean, isUniform: boolean, experiments: number[], items: Array<{index: number, name: string,
 *   experiment: number, subexperiment: number|null}>}>} `subexperiment` is null for the experiment's last, and the
 *   definition is the first item's; `isUniform` is false when its items differ in more than their experiment.
 */
export function listOutputs(document) {
  const groups = new Map()
  listItems(document).forEach((item, index) => {
    if (!isMapping(item)) return
    const key = findOutputKey(item)
    if (!groups.has(key)) {
      const operation = readOperation(item.operation)
      groups.set(key, {
        key,
        name: nameGroup(item),
        kind: operation ? 'feature' : 'trace',
        operands: Array.isArray(item.operands) ? item.operands : [],
        unit: item.unit ?? '',
        operation,
        operationKwargs: item.operation_kwargs ?? {},
        subexperiment: item.subexperiment_idx ?? null,
        traceName: item.trace_name_for_plotting ?? null,
        isValidationData: isValidationData(item),
        isUniform: true,
        experiments: [],
        items: [],
        first: item,
      })
    }
    const group = groups.get(key)
    const experiment = item.experiment_idx ?? 0
    if (DEFINITION_KEYS.some((name) => JSON.stringify(item[name]) !== JSON.stringify(group.first[name]))) group.isUniform = false
    group.items.push({ index, name: String(item.data_item_name ?? ''), experiment, subexperiment: item.subexperiment_idx ?? null })
    if (!group.experiments.includes(experiment)) group.experiments.push(experiment)
  })
  return [...groups.values()].map(({ first, ...group }) => group)
}

/**
 * Names the items of an output in each experiment: the output's name for one experiment, else the name and the
 * experiment's label (as letters, digits and underscores), or `e` and its index when it has none or shares it with
 * another experiment. A name another item has gets `_2`, `_3`...
 *
 * @param {Object} document
 * @param {string} name
 * @param {number[]} experiments - Those to name the items of.
 * @param {Set<string>} taken - The names of the items that stay; the names given are added to it.
 * @param {number} count - How many experiments the output is in.
 * @returns {string[]}
 */
function nameItems(document, name, experiments, taken, count) {
  const labels = document.protocol_info?.experiment_labels
  const slugs = (Array.isArray(labels) ? labels : []).map((label) => (typeof label === 'string' ? label.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') : ''))
  return experiments.map((experiment) => {
    const slug = slugs[experiment]
    const base = count === 1 ? name : `${name}_${slug && slugs.indexOf(slug) === slugs.lastIndexOf(slug) ? slug : `e${experiment}`}`
    let unique = base
    for (let index = 2; taken.has(unique); index++) unique = `${base}_${index}`
    taken.add(unique)
    return unique
  })
}

/**
 * Writes an output's prediction item for one experiment, as circulatory_autogen #536 reads it.
 *
 * @param {Object} output - As addOutput takes it.
 * @param {string} name - The item's data_item_name.
 * @param {number} experiment
 * @returns {Object}
 */
function buildItem(output, name, experiment) {
  const operation = readOperation(output.operation)
  const kwargs = operation && isMapping(output.operationKwargs) && Object.keys(output.operationKwargs).length ? output.operationKwargs : null
  return {
    data_item_name: name,
    operands: [...output.operands],
    unit: output.unit ?? '',
    ...(operation ? { operation } : {}),
    ...(kwargs ? { operation_kwargs: { ...kwargs } } : {}),
    experiment_idx: experiment,
    ...(output.subexperiment != null ? { subexperiment_idx: output.subexperiment } : {}),
    item_name_for_plotting: output.itemName ?? output.name,
    ...(output.traceName ? { trace_name_for_plotting: output.traceName } : {}),
  }
}

/**
 * Lists the names of a document's data and prediction items, but for those left out.
 *
 * @param {Object} document
 * @param {Set<number>} [except] - Places in prediction_items.
 * @returns {Set<string>}
 */
function findTakenNames(document, except = new Set()) {
  const names = (items) => (Array.isArray(items) ? items : []).filter(isMapping).map((item) => item.data_item_name ?? item.variable)
  const predictions = names(document.prediction_items).filter((_, index) => !except.has(index))
  return new Set([...names(document.data_items), ...predictions].filter((name) => name != null).map(String))
}

/**
 * Makes a document an object that can hold prediction items: a bare list of data items becomes its data_items.
 *
 * @param {Object|Array|null} document
 * @returns {Object} A copy.
 */
const ensureObject = (document) => (Array.isArray(document) ? { data_items: copy(document) } : copy(document ?? {}))

/**
 * Adds an output: one prediction item for each experiment given, after the others.
 *
 * @param {Object|Array|null} document
 * @param {Object} output
 * @param {string} output.name - Its item_name_for_plotting, and its items' data_item_name: the name for one
 *   experiment, else the name and each experiment's label.
 * @param {string[]} output.operands - The variable to record, as circulatory_autogen names it.
 * @param {string} output.unit
 * @param {number[]} output.experiments - Their indices.
 * @param {number|null} [output.subexperiment] - The sub-experiment it records over; by default each experiment's last.
 * @param {string|null} [output.operation] - For a feature, e.g. 'min_in_range'; none for a trace.
 * @param {Object} [output.operationKwargs] - The operation's arguments, e.g. `{start_frac: 0, end_frac: 0.2}`.
 * @param {string} [output.traceName] - The trace_name_for_plotting: the variable's label.
 * @param {string} [output.itemName] - The item_name_for_plotting, when not the name.
 * @returns {Object}
 */
export function addOutput(document, output) {
  const edited = ensureObject(document)
  const taken = findTakenNames(edited)
  const names = nameItems(edited, output.name, output.experiments, taken, output.experiments.length)
  const items = output.experiments.map((experiment, position) => buildItem(output, names[position], experiment))
  edited.prediction_items = [...(Array.isArray(edited.prediction_items) ? edited.prediction_items : []), ...items]
  return edited
}

/**
 * Finds the places of the items of an output the editor can change: not validation data.
 *
 * @param {Object} document
 * @param {string} key - From listOutputs.
 * @returns {number[]}
 */
function findEditableItems(document, key) {
  return listItems(document).flatMap((item, index) => (isMapping(item) && !isValidationData(item) && findOutputKey(item) === key ? [index] : []))
}

/**
 * Changes an output: its items are written afresh where the first of them was. An item keeps its name while the
 * output keeps its own, unless it was named for one experiment and the output now has several. Validation data is
 * never changed.
 *
 * @param {Object} document
 * @param {string} key - From listOutputs.
 * @param {Object} change - Any of what addOutput takes; the rest stays as it is.
 * @returns {Object} The document given, when there is no such output to change.
 */
export function updateOutput(document, key, change) {
  const places = findEditableItems(document, key)
  if (!places.length) return document
  const edited = ensureObject(document)
  const current = listOutputs(edited).find((group) => group.key === key)
  const output = {
    name: current.name,
    operands: current.operands,
    unit: current.unit,
    experiments: current.experiments,
    subexperiment: current.subexperiment,
    operation: current.operation,
    operationKwargs: current.operationKwargs,
    traceName: current.traceName,
    ...change,
  }
  const kept = new Map()
  if (output.name === current.name) {
    for (const index of places) {
      const item = edited.prediction_items[index]
      const name = String(item.data_item_name)
      const isNamedForOne = name === output.name && output.experiments.length > 1
      const experiment = item.experiment_idx ?? 0
      if (!isNamedForOne && output.experiments.includes(experiment) && !kept.has(experiment)) kept.set(experiment, name)
    }
  }
  const taken = findTakenNames(edited, new Set(places))
  for (const name of kept.values()) taken.add(name)
  const fresh = output.experiments.filter((experiment) => !kept.has(experiment))
  const freshNames = nameItems(edited, output.name, fresh, taken, output.experiments.length)
  const names = new Map(fresh.map((experiment, position) => [experiment, freshNames[position]]))
  const items = output.experiments.map((experiment) => buildItem(output, kept.get(experiment) ?? names.get(experiment), experiment))
  const others = edited.prediction_items.filter((_, index) => !places.includes(index))
  others.splice(places[0], 0, ...items)
  edited.prediction_items = others
  return edited
}

/**
 * Removes an output's items. Validation data is never removed.
 *
 * @param {Object} document
 * @param {string} key - From listOutputs.
 * @returns {Object} The document given, when there is no such output to remove.
 */
export function removeOutput(document, key) {
  const places = findEditableItems(document, key)
  if (!places.length) return document
  const edited = ensureObject(document)
  edited.prediction_items = edited.prediction_items.filter((_, index) => !places.includes(index))
  return edited
}
