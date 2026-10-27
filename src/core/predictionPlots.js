/**
 * Reads, edits and checks an obs_data document's prediction_plots, as circulatory_autogen (#591) draws them: figures
 * that plot a feature across experiments, such as an I–V curve, by pairing, experiment by experiment, the features of
 * one group of prediction items (an item_name_for_plotting) with another group's or an input's value in a
 * sub-experiment; or that plot a model output with an input over time or against it, one experiment at a time. Each
 * edit gives a new document, keeping everything it doesn't touch.
 */
import { formatPythonList, formatPythonRepr, getPythonTypeName } from './pythonFormat.js'
import { nameItemForPlotting, readOperation } from './predictionValidation.js'
import { isMapping } from './protocolShapes.js'

// A plot's kinds: a feature against another group's or an input's value, across experiments; or a model output and an
// input over time on twin y axes, or the output against the input, in each experiment.
export const PREDICTION_PLOT_KINDS = [
  { value: 'feature_vs_feature', label: 'A feature against a feature' },
  { value: 'feature_vs_input', label: 'A feature against an input' },
  { value: 'input_and_output', label: 'An input and an output over time' },
  { value: 'output_vs_input', label: 'An output against an input' },
]
// The keys each kind takes, in the order a plot is written.
export const PREDICTION_PLOT_KIND_KEYS = {
  feature_vs_feature: ['name', 'kind', 'x', 'y', 'series'],
  feature_vs_input: ['name', 'kind', 'x', 'y', 'series'],
  input_and_output: ['name', 'kind', 'input', 'output', 'experiments'],
  output_vs_input: ['name', 'kind', 'input', 'output', 'experiments'],
}
// Every kind's keys: those a kind doesn't take are another's, and go when a plot changes kind.
export const PREDICTION_PLOT_KEYS = [...new Set(Object.values(PREDICTION_PLOT_KIND_KEYS).flat())]
// How an input that is a trace becomes one number: its value at the end of its sub-experiment, its mean, maximum or
// minimum over it, or `{at: <seconds from the start of the sub-experiment>}`.
export const INPUT_REDUCTIONS = ['final', 'mean', 'max', 'min']
// The keys of a reference to an input's value in a sub-experiment.
const INPUT_KEYS = ['params_to_change', 'subexperiment_idx', 'reduce']

/**
 * Whether a kind plots a model output with an input, in each experiment, rather than features across them.
 *
 * @param {*} kind
 * @returns {boolean}
 */
export const isOutputKind = (kind) => kind === 'input_and_output' || kind === 'output_vs_input'

/**
 * Copies a document as JSON, so edits never reach the one given.
 *
 * @param {*} document
 * @returns {*}
 */
const copy = (document) => JSON.parse(JSON.stringify(document))

/**
 * Whether a value refers to an input's value in a sub-experiment: `{params_to_change, subexperiment_idx}`.
 *
 * @param {*} value
 * @returns {boolean}
 */
export const isInputReference = (value) => isMapping(value) && Object.hasOwn(value, 'params_to_change')

/**
 * Lists a document's prediction plots, as it has them.
 *
 * @param {Object|Array|null} document
 * @returns {Array<Object>}
 */
export const listPredictionPlots = (document) => (isMapping(document) && Array.isArray(document.prediction_plots) ? document.prediction_plots : [])

/**
 * Lists the groups of a document's prediction items, as CA names them for plotting, which a plot's x and y name.
 *
 * @param {Object|Array|null} document
 * @returns {Array<{name: string, unit: string, experiments: number[], isFeature: boolean, items: Array<{index: number,
 *   name: string, experiment: number}>}>} In the order of their first items. `isFeature` is true when each item has
 *   an operation and isn't a series, so gives one number.
 */
export function listFeatureGroups(document) {
  const items = isMapping(document) && Array.isArray(document.prediction_items) ? document.prediction_items : []
  const groups = new Map()
  items.forEach((item, index) => {
    if (!isMapping(item)) return
    const name = nameItemForPlotting(item)
    if (!groups.has(name)) groups.set(name, { name, unit: typeof item.unit === 'string' ? item.unit : '', experiments: [], isFeature: true, items: [] })
    const group = groups.get(name)
    const experiment = item.experiment_idx ?? 0
    group.items.push({ index, name: String(item.data_item_name ?? item.variable ?? ''), experiment })
    if (!group.experiments.includes(experiment)) group.experiments.push(experiment)
    if (readOperation(item.operation) == null || item.data_type === 'series') group.isFeature = false
  })
  return [...groups.values()].map((group) => ({ ...group, experiments: [...group.experiments].sort((a, b) => a - b) }))
}

/**
 * Writes a plot as CA reads it, its kind's keys in order and no others.
 *
 * @param {Object} plot
 * @param {string} plot.name - Its title, and the stem of its file.
 * @param {string} plot.kind - One of PREDICTION_PLOT_KINDS.
 * @param {string} [plot.y] - The group of the features it plots, for the feature kinds.
 * @param {string|{params_to_change: string, subexperiment_idx: number, reduce?: string|{at: number}}|null} [plot.x] -
 *   A group for 'feature_vs_feature', an input's value for 'feature_vs_input'.
 * @param {{params_to_change: string, subexperiment_idx: number, reduce?: string|{at: number}}|null} [plot.series] - An
 *   input whose values each draw a line of their own, for the feature kinds.
 * @param {{params_to_change: string}|null} [plot.input] - The input, for 'input_and_output' and 'output_vs_input'.
 * @param {string} [plot.output] - The model output, for those kinds.
 * @param {number[]|null} [plot.experiments] - The experiments they draw, for those kinds; null or left out for all.
 * @returns {Object}
 */
export function buildPredictionPlot({ name, kind, x = null, y, series = null, input = null, output = '', experiments = null }) {
  if (isOutputKind(kind)) {
    const plot = { name, kind, input: input == null ? null : copy(input), output }
    if (experiments != null) plot.experiments = copy(experiments)
    return plot
  }
  return { name, kind, x: x == null ? null : copy(x), y, series: series == null ? null : copy(series) }
}

/**
 * Edits a copy of a document's prediction plots, dropping the list when it is left empty.
 *
 * @param {Object|Array|null} document
 * @param {Function} edit - Called with the copy's list, to change in place.
 * @returns {Object}
 */
function editPlots(document, edit) {
  const edited = Array.isArray(document) ? { data_items: copy(document) } : copy(document ?? {})
  const plots = Array.isArray(edited.prediction_plots) ? edited.prediction_plots : []
  edit(plots)
  if (plots.length) edited.prediction_plots = plots
  else delete edited.prediction_plots
  return edited
}

/**
 * Adds a plot after the others.
 *
 * @param {Object|Array|null} document
 * @param {Object} plot - As buildPredictionPlot takes it.
 * @returns {Object}
 */
export const addPredictionPlot = (document, plot) => editPlots(document, (plots) => plots.push(buildPredictionPlot(plot)))

/**
 * Changes a plot, keeping its place and any keys no kind takes. A change of kind drops the old kind's keys.
 *
 * @param {Object} document
 * @param {number} index - Its place in prediction_plots.
 * @param {Object} change - Any of what buildPredictionPlot takes; the rest stays as it is. `experiments: null` draws
 *   every experiment.
 * @returns {Object} The document given, when it has no such plot.
 */
export function updatePredictionPlot(document, index, change) {
  const current = listPredictionPlots(document)[index]
  if (!isMapping(current)) return document
  const built = buildPredictionPlot({ ...current, ...change })
  // In the order the plot has its keys, then the kind's new ones.
  const kept = Object.keys(current).filter((key) => Object.hasOwn(built, key) || !PREDICTION_PLOT_KEYS.includes(key))
  const keys = [...new Set([...kept, ...Object.keys(built)])]
  return editPlots(document, (plots) => {
    plots[index] = Object.fromEntries(keys.map((key) => [key, Object.hasOwn(built, key) ? built[key] : plots[index][key]]))
  })
}

/**
 * Removes a plot.
 *
 * @param {Object} document
 * @param {number} index - Its place in prediction_plots.
 * @returns {Object} The document given, when it has no such plot.
 */
export function removePredictionPlot(document, index) {
  if (!(index >= 0 && index < listPredictionPlots(document).length)) return document
  return editPlots(document, (plots) => plots.splice(index, 1))
}

/**
 * Renames a group in the plots that name it, in place: its prediction items were renamed.
 *
 * @param {Object} document - Changed in place.
 * @param {string} from
 * @param {string} to
 */
export function renamePlotGroup(document, from, to) {
  for (const plot of listPredictionPlots(document)) {
    if (!isMapping(plot)) continue
    if (plot.y === from) plot.y = to
    if (plot.kind === 'feature_vs_feature' && plot.x === from) plot.x = to
  }
}

/**
 * Finds the plots a sub-experiment's removal leaves without their input: one that reads an input there, or after it
 * in the same experiment while its features are in others too, so that one index no longer names the same
 * sub-experiment in each.
 *
 * @param {Object} document
 * @param {number} experiment
 * @param {number} sub
 * @returns {number[]} Their places in prediction_plots.
 */
export function findPlotsLosingInput(document, experiment, sub) {
  const groups = new Map(listFeatureGroups(document).map((group) => [group.name, group.experiments]))
  return listPredictionPlots(document).flatMap((plot, index) => {
    if (!isMapping(plot)) return []
    const experiments = groups.get(plot.y) ?? []
    const isLost = [plot.x, plot.series].some((reference) => {
      if (!isInputReference(reference) || !experiments.includes(experiment) || !(reference.subexperiment_idx >= sub)) return false
      return reference.subexperiment_idx === sub || experiments.some((other) => other !== experiment)
    })
    return isLost ? [index] : []
  })
}

/**
 * Keeps a document's plots reading the same inputs as a sub-experiment goes, in place: one whose features are only in
 * that experiment moves down with a later input, and one left without its input goes (findPlotsLosingInput). Called
 * before its prediction items are renumbered.
 *
 * @param {Object} document - Changed in place.
 * @param {number} experiment
 * @param {number} sub
 */
export function followSubExperimentRemoval(document, experiment, sub) {
  if (!Array.isArray(document.prediction_plots)) return
  const lost = new Set(findPlotsLosingInput(document, experiment, sub))
  const groups = new Map(listFeatureGroups(document).map((group) => [group.name, group.experiments]))
  document.prediction_plots = document.prediction_plots.flatMap((plot, index) => {
    if (lost.has(index)) return []
    if (!isMapping(plot) || !(groups.get(plot.y) ?? []).includes(experiment)) return [plot]
    const followed = { ...plot }
    for (const key of ['x', 'series']) {
      const reference = plot[key]
      if (isInputReference(reference) && reference.subexperiment_idx > sub) followed[key] = { ...reference, subexperiment_idx: reference.subexperiment_idx - 1 }
    }
    return [followed]
  })
  if (!document.prediction_plots.length) delete document.prediction_plots
}

/**
 * Renumbers the experiments 'input_and_output' and 'output_vs_input' plots name, in place, as experiments move or go:
 * one left naming none goes.
 *
 * @param {Object} document - Changed in place.
 * @param {(experiment: number) => number|null} renumber - An experiment's new place, null when it goes.
 */
export function renumberPlotExperiments(document, renumber) {
  if (!Array.isArray(document.prediction_plots)) return
  document.prediction_plots = document.prediction_plots.flatMap((plot) => {
    if (!isMapping(plot) || !isOutputKind(plot.kind) || !Array.isArray(plot.experiments)) return [plot]
    const experiments = plot.experiments.map((experiment) => (Number.isInteger(experiment) ? renumber(experiment) : experiment)).filter((experiment) => experiment != null)
    return experiments.length ? [{ ...plot, experiments }] : []
  })
  if (!document.prediction_plots.length) delete document.prediction_plots
}

/**
 * Names a plot as messages refer to it.
 *
 * @param {number} index
 * @param {*} plot
 * @returns {string}
 */
const nameAt = (index, plot) => `prediction_plots[${index}]${typeof plot?.name === 'string' && plot.name ? ` (${formatPythonRepr(plot.name)})` : ''}`

/**
 * Checks a group a plot names: that it is one, gives one number in each experiment, once.
 *
 * @param {string} axis - 'x' or 'y'.
 * @param {string} name
 * @param {Map<string, Object>} groups - From listFeatureGroups, by name.
 * @returns {string[]}
 */
function checkGroup(axis, name, groups) {
  const group = groups.get(name)
  if (!group) return [`${axis} names no prediction items: none has the item_name_for_plotting ${formatPythonRepr(name)}.`]
  const errors = []
  if (!group.isFeature) errors.push(`${axis} names ${formatPythonRepr(name)}, which has items that aren't features: each needs an operation that gives one number, and no data_type 'series'.`)
  for (const experiment of group.experiments) {
    const names = group.items.filter((item) => item.experiment === experiment).map((item) => item.name)
    if (names.length > 1) errors.push(`${axis} names ${formatPythonRepr(name)}, which has ${names.length} items in experiment_idx ${experiment} (${names.join(', ')}); a plot takes one per experiment.`)
  }
  return errors
}

/**
 * Checks how an input reference turns a trace into one number: one of INPUT_REDUCTIONS, or `{at: <seconds>}`.
 *
 * @param {string} axis - 'x' or 'series'.
 * @param {*} reduce
 * @returns {string[]}
 */
function checkReduce(axis, reduce) {
  if (INPUT_REDUCTIONS.includes(reduce)) return []
  if (isMapping(reduce)) {
    const unknown = Object.keys(reduce).filter((key) => key !== 'at').sort()
    if (unknown.length) return [`${axis}'s reduce has keys it doesn't take: ${formatPythonList(unknown)}. It is {'at': <seconds>}.`]
    const { at } = reduce
    if (typeof at === 'number' && Number.isFinite(at) && at >= 0) return []
    return [`${axis}'s reduce at must be a number of seconds from the start of the sub-experiment, 0 or more, got ${formatPythonRepr(at ?? null)}.`]
  }
  return [`${axis}'s reduce must be ${INPUT_REDUCTIONS.map(formatPythonRepr).join(', ')} or {'at': <seconds>}, got ${formatPythonRepr(reduce)}.`]
}

/**
 * Checks a reference to an input's value: its keys, that protocol_info sets the input, and that it is set in the
 * sub-experiment in each experiment, to a number or a trace (which `reduce` turns into one, reading `{at}` no later
 * than the sub-experiment's end, as CA does).
 *
 * @param {string} axis - 'x' or 'series'.
 * @param {*} reference
 * @param {Object} info - The protocol_info.
 * @param {number[]} experiments - Those of the plot's y.
 * @returns {string[]}
 */
function checkInputReference(axis, reference, info, experiments) {
  const shape = `{'params_to_change': <key>, 'subexperiment_idx': <int>[, 'reduce': <how>]}`
  if (!isMapping(reference)) return [`${axis} must be ${shape}, got ${formatPythonRepr(reference)}.`]
  const unknown = Object.keys(reference).filter((key) => !INPUT_KEYS.includes(key)).sort()
  if (unknown.length) return [`${axis} has keys it doesn't take: ${formatPythonList(unknown)}. It is ${shape}.`]
  const { params_to_change: key, subexperiment_idx: sub } = reference
  if (typeof key !== 'string') return [`${axis}'s params_to_change must name an input, got ${formatPythonRepr(key ?? null)}.`]
  if (!Number.isInteger(sub)) return [`${axis}'s subexperiment_idx must be an integer, got ${formatPythonRepr(sub ?? null)}.`]
  if (Object.hasOwn(reference, 'reduce')) {
    const errors = checkReduce(axis, reference.reduce)
    if (errors.length) return errors
  }
  const rows = isMapping(info.params_to_change) ? info.params_to_change[key] : undefined
  if (!Array.isArray(rows)) return [`${axis} names the input ${formatPythonRepr(key)}, which protocol_info's params_to_change doesn't set.`]
  return experiments.flatMap((experiment) => {
    const subs = Array.isArray(info.sim_times?.[experiment]) ? info.sim_times[experiment].length : 0
    if (!(sub >= 0 && sub < subs)) return [`${axis}'s subexperiment_idx ${sub} is not a sub-experiment of experiment_idx ${experiment}, which has ${subs}.`]
    const value = rows[experiment]?.[sub]
    if (typeof value === 'number' && Number.isFinite(value)) return []
    if (typeof value === 'string') {
      const duration = info.sim_times[experiment][sub]
      const at = isMapping(reference.reduce) ? reference.reduce.at : null
      if (at == null || typeof duration !== 'number' || !(at > duration)) return []
      return [`${axis}'s reduce at ${at} s is after the end of sub-experiment ${sub} of experiment_idx ${experiment}, which is ${duration} s long.`]
    }
    return [`${axis} reads ${formatPythonRepr(key)} in experiment_idx ${experiment}, sub-experiment ${sub}, which is ${formatPythonRepr(value ?? null)}: neither a number nor a trace.`]
  })
}

/**
 * Lists the inputs a plot reads as traces with no reduce: CA leaves out their points, with a warning.
 *
 * @param {Object} plot
 * @param {Object} info - The protocol_info.
 * @param {number[]} experiments - Those of the plot's y.
 * @returns {string[]}
 */
function warnUnreducedTraces(plot, info, experiments) {
  return ['x', 'series'].flatMap((axis) => {
    const reference = plot[axis]
    if (!isInputReference(reference) || reference.reduce != null) return []
    const rows = info.params_to_change?.[reference.params_to_change]
    const traced = experiments.filter((experiment) => typeof rows?.[experiment]?.[reference.subexperiment_idx] === 'string')
    if (!traced.length) return []
    return [
      `${axis} reads ${formatPythonRepr(reference.params_to_change)} as a trace in experiment_idx ${formatPythonList(traced)}, and has no reduce to make it one number: CA leaves out those points.`,
    ]
  })
}

/**
 * Checks what an 'input_and_output' or 'output_vs_input' plot reads: an input protocol_info sets, an output, and the
 * experiments, all when left out.
 *
 * @param {Object} plot
 * @param {Object} info - The protocol_info.
 * @returns {string[]}
 */
function checkOutputPlot(plot, info) {
  const errors = []
  const shape = `{'params_to_change': <key>}`
  const { input } = plot
  if (!isMapping(input)) errors.push(`input must be ${shape}, got ${formatPythonRepr(input ?? null)}.`)
  else {
    const unknown = Object.keys(input).filter((key) => key !== 'params_to_change').sort()
    if (unknown.length) errors.push(`input has keys it doesn't take: ${formatPythonList(unknown)}. It is ${shape}.`)
    else if (typeof input.params_to_change !== 'string') errors.push(`input's params_to_change must name an input, got ${formatPythonRepr(input.params_to_change ?? null)}.`)
    else if (!isMapping(info.params_to_change) || !Array.isArray(info.params_to_change[input.params_to_change])) {
      errors.push(`input names ${formatPythonRepr(input.params_to_change)}, which protocol_info's params_to_change doesn't set.`)
    }
  }
  if (typeof plot.output !== 'string' || !plot.output.trim()) errors.push(`output must name a model output, got ${formatPythonRepr(plot.output ?? null)}.`)
  if (Object.hasOwn(plot, 'experiments')) {
    const { experiments } = plot
    const count = Array.isArray(info.sim_times) ? info.sim_times.length : 0
    if (!Array.isArray(experiments) || !experiments.length || !experiments.every(Number.isInteger)) {
      errors.push(`experiments must be a list of experiment_idx, at least one, or left out for all, got ${formatPythonRepr(experiments)}.`)
    } else {
      const outside = experiments.filter((experiment) => !(experiment >= 0 && experiment < count))
      if (outside.length) errors.push(`experiments names ${formatPythonList(outside)}, which protocol_info doesn't have: it has ${count}.`)
      if (new Set(experiments).size !== experiments.length) errors.push(`experiments names an experiment more than once: ${formatPythonList(experiments)}.`)
    }
  }
  return errors
}

/**
 * Checks one plot, the names of the others given.
 *
 * @param {*} plot
 * @param {number} index
 * @param {Object} context
 * @param {Map<string, Object>} context.groups - From listFeatureGroups, by name.
 * @param {Object} context.info - The protocol_info.
 * @param {Map<string, number>} context.firsts - The place of the first plot of each name.
 * @returns {{errors: string[], warnings: string[]}} Each naming it.
 */
function checkPlot(plot, index, { groups, info, firsts }) {
  const where = nameAt(index, plot)
  const named = (messages) => messages.map((message) => `${where}: ${message}`)
  if (!isMapping(plot)) return { errors: [`${where} must be a dict, got <class '${getPythonTypeName(plot)}'>.`], warnings: [] }
  const allowed = PREDICTION_PLOT_KIND_KEYS[plot.kind] ?? PREDICTION_PLOT_KEYS
  const unknown = Object.keys(plot).filter((key) => !PREDICTION_PLOT_KEYS.includes(key)).sort()
  if (unknown.length) return { errors: [`Unknown keys in ${where} not in schema: ${formatPythonList(unknown)}`], warnings: [] }
  const errors = []
  if (typeof plot.name !== 'string' || !plot.name.trim()) errors.push('It needs a name: a string, not empty.')
  else if (firsts.get(plot.name) !== index) errors.push(`Its name is prediction_plots[${firsts.get(plot.name)}]'s too; each plot needs its own.`)
  const kinds = PREDICTION_PLOT_KINDS.map(({ value }) => value)
  if (!kinds.includes(plot.kind)) {
    errors.push(`Its kind must be ${kinds.slice(0, -1).map(formatPythonRepr).join(', ')} or ${formatPythonRepr(kinds.at(-1))}, got ${formatPythonRepr(plot.kind ?? null)}.`)
    return { errors: named(errors), warnings: [] }
  }
  const foreign = Object.keys(plot).filter((key) => !allowed.includes(key)).sort()
  if (foreign.length) errors.push(`A ${plot.kind} plot doesn't take ${formatPythonList(foreign)}: it takes ${formatPythonList(allowed)}.`)
  if (isOutputKind(plot.kind)) return { errors: named([...errors, ...checkOutputPlot(plot, info)]), warnings: [] }
  if (typeof plot.y !== 'string' || !plot.y) errors.push(`y must name a group of features, got ${formatPythonRepr(plot.y ?? null)}.`)
  const yGroup = typeof plot.y === 'string' ? groups.get(plot.y) : null
  if (typeof plot.y === 'string' && plot.y) errors.push(...checkGroup('y', plot.y, groups))
  const experiments = yGroup?.experiments ?? []
  if (plot.kind === 'feature_vs_feature') {
    if (typeof plot.x !== 'string' || !plot.x) errors.push(`For a feature_vs_feature plot, x must name a group of features, got ${formatPythonRepr(plot.x ?? null)}.`)
    else {
      const groupErrors = checkGroup('x', plot.x, groups)
      errors.push(...groupErrors)
      const xGroup = groups.get(plot.x)
      if (xGroup && yGroup && JSON.stringify(xGroup.experiments) !== JSON.stringify(yGroup.experiments)) {
        errors.push(
          `x and y cover different experiments: ${formatPythonRepr(plot.x)} experiment_idx ${formatPythonList(xGroup.experiments)}, ` +
            `${formatPythonRepr(plot.y)} ${formatPythonList(yGroup.experiments)}. Each point needs both.`
        )
      }
    }
  } else {
    errors.push(...checkInputReference('x', plot.x, info, experiments))
  }
  if (plot.series != null) errors.push(...checkInputReference('series', plot.series, info, experiments))
  return { errors: named(errors), warnings: errors.length ? [] : named(warnUnreducedTraces(plot, info, experiments)) }
}

/**
 * Checks a document's prediction plots as CA does, for each plot: its keys, the kind's alone, a name of its own and
 * its kind. For the feature kinds, the x it takes, groups that exist, are features and give one per experiment, x and
 * y over the same experiments, and inputs that protocol_info sets to a number or a trace in that sub-experiment of
 * each experiment, with a reduce CA knows. For 'input_and_output' and 'output_vs_input', an input protocol_info sets,
 * an output, and experiments it has.
 *
 * @param {Object|Array|null} document
 * @returns {{errors: string[], plotErrors: string[][], plotWarnings: string[][]}} `plotErrors` has each plot's own, by
 *   place; `plotWarnings` what CA draws without: the points of an input read as a trace with no reduce.
 */
export function validatePredictionPlots(document) {
  const plots = isMapping(document) ? document.prediction_plots : undefined
  if (plots == null) return { errors: [], plotErrors: [], plotWarnings: [] }
  if (!Array.isArray(plots)) return { errors: [`prediction_plots must be a list of dict entries, got <class '${getPythonTypeName(plots)}'>`], plotErrors: [], plotWarnings: [] }
  const groups = new Map(listFeatureGroups(document).map((group) => [group.name, group]))
  const info = isMapping(document.protocol_info) ? document.protocol_info : {}
  const firsts = new Map()
  plots.forEach((plot, index) => {
    if (isMapping(plot) && typeof plot.name === 'string' && !firsts.has(plot.name)) firsts.set(plot.name, index)
  })
  const checked = plots.map((plot, index) => checkPlot(plot, index, { groups, info, firsts }))
  const plotErrors = checked.map(({ errors }) => errors)
  return { errors: plotErrors.flat(), plotErrors, plotWarnings: checked.map(({ warnings }) => warnings) }
}

/**
 * Reads an input's value in a sub-experiment of an experiment, as a point's x or series.
 *
 * @param {Object} info - The protocol_info.
 * @param {{params_to_change: string, subexperiment_idx: number, reduce?: string|{at: number}}} reference
 * @param {number} experiment
 * @returns {{value: number, reason: string|null}} NaN, and why, when it isn't a number.
 */
function readInput(info, { params_to_change: key, subexperiment_idx: sub, reduce }, experiment) {
  const value = info.params_to_change?.[key]?.[experiment]?.[sub]
  if (typeof value === 'number') return { value, reason: null }
  if (typeof value !== 'string') return { value: NaN, reason: `${key} has no value in sub-experiment ${sub + 1}.` }
  if (reduce == null) return { value: NaN, reason: `${key} is the trace ${formatPythonRepr(value)} in sub-experiment ${sub + 1}, with no reduce to make it one number.` }
  const how = isMapping(reduce) ? `at ${reduce.at} s` : reduce
  return { value: NaN, reason: `${key} is the trace ${formatPythonRepr(value)} in sub-experiment ${sub + 1}: CA reduces it (${how}) when it draws, and protocol-kit doesn't.` }
}

/**
 * Names an input reference as an axis.
 *
 * @param {{params_to_change: string, subexperiment_idx: number, reduce?: string|{at: number}}} reference
 * @returns {string}
 */
export function describeInputReference({ params_to_change: key, subexperiment_idx: sub, reduce }) {
  const how = reduce == null ? '' : isMapping(reduce) ? `, at ${reduce.at} s` : `, ${reduce}`
  return `${key} (sub-experiment ${sub + 1}${how})`
}

/**
 * Lists the experiments an 'input_and_output' or 'output_vs_input' plot draws: those it names, else all.
 *
 * @param {Object} document
 * @param {Object} plot
 * @returns {number[]}
 */
export function listPlotExperiments(document, plot) {
  if (Array.isArray(plot?.experiments)) return [...plot.experiments]
  const count = Array.isArray(document?.protocol_info?.sim_times) ? document.protocol_info.sim_times.length : 0
  return Array.from({ length: count }, (_, experiment) => experiment)
}

/**
 * Pairs a run's features into the points of each prediction plot, ready to draw: for the feature kinds, one per
 * experiment of its y, whose x is the x group's feature in that experiment or the input's value, sorted by series,
 * then x. An 'input_and_output' or 'output_vs_input' plot draws a run's traces, not features: it has no points, but
 * names its input, output and experiments for the host to draw.
 *
 * @param {Object} document
 * @param {Array<Object>} features - From computeFeatures.
 * @returns {Array<{index: number, name: string, kind: string, x: {label: string, unit: string}, y: {label: string,
 *   unit: string}, series: {label: string}|null, input: {label: string}|null, output: {label: string}|null,
 *   experiments: number[], points: Array<{experiment: number, x: number, y: number, series: number|null, measured:
 *   {value: number, std: number|null}|null}>, skipped: Array<{experiment: number, reason: string}>, errors:
 *   string[]}>} A plot with errors has no points. A point whose x or y isn't a number is skipped, saying why;
 *   `measured` is the y item's own value and std, when it has them.
 */
export function computePlotSeries(document, features) {
  const { plotErrors } = validatePredictionPlots(document)
  const info = isMapping(document?.protocol_info) ? document.protocol_info : {}
  const items = Array.isArray(document?.prediction_items) ? document.prediction_items : []
  const byGroup = new Map()
  for (const feature of features ?? []) {
    if (!byGroup.has(feature.group)) byGroup.set(feature.group, new Map())
    byGroup.get(feature.group).set(feature.experiment, feature)
  }
  const unitOf = (group) => [...(byGroup.get(group)?.values() ?? [])][0]?.unit ?? ''
  const groups = new Map(listFeatureGroups(document).map((group) => [group.name, group]))
  return listPredictionPlots(document).map((plot, index) => {
    const errors = plotErrors[index] ?? []
    const isValid = !errors.length
    const isOutput = isValid && isOutputKind(plot.kind)
    const result = {
      index,
      name: isMapping(plot) ? String(plot.name ?? '') : '',
      kind: plot?.kind ?? null,
      x: { label: '', unit: '' },
      y: { label: isValid && !isOutput ? plot.y : '', unit: isValid && !isOutput ? unitOf(plot.y) : '' },
      series: isValid && !isOutput && plot.series ? { label: describeInputReference(plot.series) } : null,
      input: isOutput ? { label: plot.input.params_to_change } : null,
      output: isOutput ? { label: plot.output } : null,
      experiments: isOutput ? listPlotExperiments(document, plot) : [],
      points: [],
      skipped: [],
      errors,
    }
    if (!isValid || isOutput) return result
    const isAgainstFeature = plot.kind === 'feature_vs_feature'
    result.x = isAgainstFeature ? { label: plot.x, unit: unitOf(plot.x) } : { label: describeInputReference(plot.x), unit: '' }
    for (const experiment of groups.get(plot.y).experiments) {
      result.experiments.push(experiment)
      const yFeature = byGroup.get(plot.y)?.get(experiment)
      const xFeature = isAgainstFeature ? byGroup.get(plot.x)?.get(experiment) : null
      const xInput = isAgainstFeature ? null : readInput(info, plot.x, experiment)
      const seriesInput = plot.series ? readInput(info, plot.series, experiment) : null
      const x = isAgainstFeature ? (xFeature?.value ?? NaN) : xInput.value
      const y = yFeature?.value ?? NaN
      const inputReason = xInput?.reason ?? seriesInput?.reason
      if (!Number.isFinite(x) || !Number.isFinite(y) || inputReason) {
        const failed = [yFeature, xFeature].find((feature) => feature?.error)
        result.skipped.push({ experiment, reason: inputReason ?? failed?.error ?? (yFeature ? 'It has no value.' : 'It was not computed.') })
        continue
      }
      const item = yFeature ? items[yFeature.index] : null
      const measured = typeof item?.value === 'number' ? { value: item.value, std: typeof item.std === 'number' ? item.std : null } : null
      result.points.push({ experiment, x, y, series: seriesInput ? seriesInput.value : null, measured })
    }
    result.points.sort((a, b) => (a.series ?? 0) - (b.series ?? 0) || a.x - b.x)
    return result
  })
}
