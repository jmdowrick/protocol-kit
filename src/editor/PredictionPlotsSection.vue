<template>
  <section class="prediction-plots-section" aria-label="prediction_plots" :style="{ '--od-columns': `1.2fr 1.3fr 4fr ${readOnly ? '0' : '2rem'}` }">
    <h3 class="od-section">prediction_plots</h3>
    <div class="od-head" aria-hidden="true">
      <span>name</span>
      <span>kind</span>
      <span>settings</span>
      <span></span>
    </div>
    <ul class="od-list" data-testid="od-prediction-plots">
      <li v-for="(plot, index) in plots" :key="index" :class="{ 'od-invalid': (checked.plotErrors[index] ?? []).length > 0 }" data-testid="od-plot-row">
        <div class="od-main">
          <template v-if="readOnly || !isMapping(plot)">
            <span class="od-cell" :title="plot?.name">{{ plot?.name || '—' }}</span>
            <span class="od-cell">{{ plot?.kind ?? '—' }}</span>
            <span class="od-cell" data-testid="od-plot-settings">{{ describeSettings(plot) }}</span>
          </template>
          <template v-else>
            <input type="text" :value="plot.name" aria-label="name" @change="(event) => edit(index, { name: event.target.value })" />
            <select :value="plot.kind" aria-label="kind" @change="(event) => changeKind(index, event.target.value)">
              <option v-for="kind in withOwnKind(plot.kind)" :key="kind.value" :value="kind.value">{{ kind.label }}</option>
            </select>
            <span class="od-plot-settings" data-testid="od-plot-settings">
              <template v-if="plot.kind === 'feature_vs_feature' || plot.kind === 'feature_vs_input'">
                <label class="od-field">
                  y
                  <select :value="plot.y" aria-label="y" @change="(event) => edit(index, { y: event.target.value })">
                    <option v-for="group in withOwn(groupNames, plot.y)" :key="group" :value="group">{{ group }}</option>
                  </select>
                </label>
                <label v-if="plot.kind === 'feature_vs_feature'" class="od-field">
                  x
                  <select :value="plot.x" aria-label="x" @change="(event) => edit(index, { x: event.target.value })">
                    <option v-for="group in withOwn(groupNames, plot.x)" :key="group" :value="group">{{ group }}</option>
                  </select>
                </label>
                <template v-else>
                  <label class="od-field">
                    x input
                    <select :value="plot.x?.params_to_change" aria-label="x input" @change="(event) => editX(index, { params_to_change: event.target.value })">
                      <option v-for="key in withOwn(inputKeys, plot.x?.params_to_change)" :key="key" :value="key">{{ key }}</option>
                    </select>
                  </label>
                  <label class="od-field">
                    sub-experiment
                    <select :value="plot.x?.subexperiment_idx" aria-label="x sub-experiment" @change="(event) => editX(index, { subexperiment_idx: Number(event.target.value) })">
                      <option v-for="sub in withOwn(subIndices, plot.x?.subexperiment_idx)" :key="sub" :value="sub">{{ sub }}</option>
                    </select>
                  </label>
                  <label class="od-field">
                    reduce
                    <select :value="reduceChoice(plot.x)" aria-label="x reduce" @change="(event) => changeReduce(index, event.target.value)">
                      <option v-for="choice in REDUCE_CHOICES" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
                    </select>
                  </label>
                  <label v-if="reduceChoice(plot.x) === AT" class="od-field">
                    at (s)
                    <input type="number" min="0" step="any" :value="plot.x.reduce.at" aria-label="x at" @change="(event) => changeAt(index, event.target.value)" />
                  </label>
                </template>
                <label class="od-field">
                  series
                  <select :value="encodeInput(plot.series)" aria-label="series" @change="(event) => edit(index, { series: decodeInput(event.target.value) })">
                    <option :value="NONE">(none)</option>
                    <option v-for="input in withOwn(inputs, plot.series)" :key="encodeInput(input)" :value="encodeInput(input)">{{ describeAxis(input) }}</option>
                  </select>
                </label>
              </template>
              <template v-else-if="isOutputKind(plot.kind)">
                <label class="od-field">
                  input
                  <select :value="plot.input?.params_to_change" aria-label="input" @change="(event) => edit(index, { input: { params_to_change: event.target.value } })">
                    <option v-for="key in withOwn(inputKeys, plot.input?.params_to_change)" :key="key" :value="key">{{ key }}</option>
                  </select>
                </label>
                <span class="od-field">
                  output
                  <VariableCell v-if="variables.length" :model-value="typeof plot.output === 'string' ? plot.output : ''" :variables="variables" aria-label="output" @update:model-value="(name) => edit(index, { output: name })" />
                  <input v-else type="text" :value="plot.output" aria-label="output" placeholder="a model output" @change="(event) => edit(index, { output: event.target.value })" />
                </span>
                <fieldset class="od-field od-plot-experiments" aria-label="experiments">
                  <legend>experiments</legend>
                  <label v-for="experiment in experimentChoices" :key="experiment.index">
                    <input
                      type="checkbox"
                      :checked="isDrawn(plot, experiment.index)"
                      :disabled="isOnlyDrawn(plot, experiment.index)"
                      :aria-label="experiment.label"
                      @change="(event) => toggleExperiment(index, experiment.index, event.target.checked)"
                    />
                    {{ experiment.label }}
                  </label>
                </fieldset>
              </template>
            </span>
          </template>
          <span class="od-rowbtns">
            <Button v-if="!readOnly" icon="pi pi-times" text rounded size="small" severity="danger" aria-label="remove" @click="emitDocument(removePredictionPlot(document, index))" />
          </span>
        </div>
        <p v-for="message in problemsOf(index)" :key="message" class="od-error">
          <i class="pi pi-times-circle" aria-hidden="true"></i>
          {{ message }}
        </p>
        <p v-for="message in warningsOf(index)" :key="message" class="od-warn">
          <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
          {{ message }}
        </p>
      </li>
      <li v-if="!plots.length" class="od-empty">{{ readOnly ? 'No prediction_plots.' : 'No prediction_plots. Add one below.' }}</li>
    </ul>
    <Button v-if="!readOnly" label="Add prediction plot" icon="pi pi-plus" size="small" text :disabled="!groupNames.length && !inputKeys.length" @click="add" />
  </section>
</template>

<script setup>
/**
 * The prediction_plots of an obs_data document, a row each: its name, its kind (a dropdown of the four CA draws) and
 * that kind's settings alone. feature_vs_feature takes y and x, groups of features (an item_name_for_plotting), and a
 * series; feature_vs_input takes y, an input in a sub-experiment as x, how a trace there becomes one number (reduce),
 * and a series; input_and_output and output_vs_input take an input, a model output (picked from the host's variables
 * when it gives them) and the experiments drawn, all when every box is ticked. Choosing a kind writes its keys alone.
 * Each plot is checked as CA does, its errors and warnings under its row.
 */
import { computed } from 'vue'

import Button from 'primevue/button'

import './obsDataRows.css'
import {
  INPUT_REDUCTIONS,
  PREDICTION_PLOT_KINDS,
  addPredictionPlot,
  isInputReference,
  isOutputKind,
  listFeatureGroups,
  listPlotExperiments,
  listPredictionPlots,
  removePredictionPlot,
  updatePredictionPlot,
  validatePredictionPlots,
} from '../core/predictionPlots.js'
import { nameExperiment } from '../core/protocolModel.js'
import { isMapping } from '../core/protocolShapes.js'
import VariableCell from './VariableCell.vue'

// The value of series' option for none, and of reduce's.
const NONE = ''
// The value of reduce's option for a time.
const AT = 'at'
const REDUCE_CHOICES = [{ value: NONE, label: '(none)' }, ...INPUT_REDUCTIONS.map((value) => ({ value, label: value })), { value: AT, label: 'at a time' }]

const props = defineProps({
  // The obs_data document.
  document: { type: Object, required: true },
  readOnly: { type: Boolean, default: false },
  // The model's variables, as the editor's `variables` prop: an output is picked from them, else typed.
  variables: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:document'])

const plots = computed(() => listPredictionPlots(props.document))
const checked = computed(() => validatePredictionPlots(props.document))
const groupNames = computed(() => listFeatureGroups(props.document).filter(({ isFeature }) => isFeature).map(({ name }) => name))
const info = computed(() => (isMapping(props.document.protocol_info) ? props.document.protocol_info : {}))
const inputKeys = computed(() => Object.keys(isMapping(info.value.params_to_change) ? info.value.params_to_change : {}))
// The sub-experiment indices of the longest experiment.
const subIndices = computed(() => {
  const subs = Math.max(0, ...(Array.isArray(info.value.sim_times) ? info.value.sim_times : []).map((row) => (Array.isArray(row) ? row.length : 0)))
  return Array.from({ length: subs }, (_, sub) => sub)
})
// Each input in each sub-experiment, as a series reads it.
const inputs = computed(() => inputKeys.value.flatMap((key) => subIndices.value.map((sub) => ({ params_to_change: key, subexperiment_idx: sub }))))
const experimentChoices = computed(() =>
  listPlotExperiments(props.document, {}).map((index) => ({ index, label: info.value.experiment_labels?.[index] || nameExperiment(index) }))
)

/**
 * Lists the options of a select, and the plot's own value when it is none of them, so it shows.
 *
 * @param {Array} options
 * @param {*} own
 * @returns {Array}
 */
function withOwn(options, own) {
  if (own == null || own === '') return options
  const keyOf = (option) => (isMapping(option) ? encodeInput(option) : option)
  return options.some((option) => keyOf(option) === keyOf(own)) ? options : [...options, own]
}

/**
 * Lists the kinds, and a plot's own when CA has no such kind, so it shows.
 *
 * @param {*} own
 * @returns {Array<{value: string, label: string}>}
 */
const withOwnKind = (own) => (own == null || PREDICTION_PLOT_KINDS.some(({ value }) => value === own) ? PREDICTION_PLOT_KINDS : [...PREDICTION_PLOT_KINDS, { value: own, label: String(own) }])

/**
 * Writes an input reference as an option's value.
 *
 * @param {*} reference
 * @returns {string}
 */
const encodeInput = (reference) => (isMapping(reference) ? JSON.stringify([reference.params_to_change, reference.subexperiment_idx]) : NONE)

/**
 * Reads an option's value as an input reference.
 *
 * @param {string} value
 * @returns {Object|null}
 */
function decodeInput(value) {
  if (value === NONE) return null
  const [key, sub] = JSON.parse(value)
  return { params_to_change: key, subexperiment_idx: sub }
}

/**
 * Describes what an axis reads: a group's name, or an input in a sub-experiment and how it is reduced.
 *
 * @param {*} axis
 * @param {string} [none]
 * @returns {string}
 */
function describeAxis(axis, none = '—') {
  if (axis == null) return none
  if (!isMapping(axis)) return String(axis)
  const reduce = axis.reduce == null ? '' : isMapping(axis.reduce) ? `, at ${axis.reduce.at} s` : `, ${axis.reduce}`
  return `${axis.params_to_change} [sub ${axis.subexperiment_idx}${reduce}]`
}

/**
 * Describes a plot's settings, as a read-only row shows them.
 *
 * @param {*} plot
 * @returns {string}
 */
function describeSettings(plot) {
  if (!isMapping(plot)) return '—'
  if (isOutputKind(plot.kind)) {
    const experiments = Array.isArray(plot.experiments) ? plot.experiments.join(', ') : 'all'
    return `input ${plot.input?.params_to_change ?? '—'}, output ${plot.output || '—'}, experiments ${experiments}`
  }
  return `y ${plot.y ?? '—'}, x ${describeAxis(plot.x)}, series ${describeAxis(plot.series, '(none)')}`
}

/**
 * Lists a plot's messages, without their `prediction_plots[i] ('name')`.
 *
 * @param {string[]} messages
 * @returns {string[]}
 */
const withoutWhere = (messages) => messages.map((message) => message.replace(/^prediction_plots\[\d+\]( \(.*?\))?: /, ''))
const problemsOf = (index) => withoutWhere(checked.value.plotErrors[index] ?? [])
const warningsOf = (index) => withoutWhere(checked.value.plotWarnings[index] ?? [])

/** Passes an edited document on. */
const emitDocument = (document) => emit('update:document', document)

/**
 * Changes a plot.
 *
 * @param {number} index
 * @param {Object} change - Any of what updatePredictionPlot takes.
 */
const edit = (index, change) => emitDocument(updatePredictionPlot(props.document, index, change))

/**
 * Changes a feature_vs_input plot's x, keeping the rest of it.
 *
 * @param {number} index
 * @param {Object} change - Any of params_to_change, subexperiment_idx and reduce; reduce null drops it.
 */
function editX(index, change) {
  const current = isInputReference(plots.value[index].x) ? plots.value[index].x : (inputs.value[0] ?? {})
  const x = { ...current, ...change }
  if (x.reduce == null) delete x.reduce
  edit(index, { x })
}

/**
 * Which reduce option an input reference has chosen.
 *
 * @param {*} reference
 * @returns {string}
 */
const reduceChoice = (reference) => (reference?.reduce == null ? NONE : isMapping(reference.reduce) ? AT : reference.reduce)

/**
 * Chooses how a feature_vs_input plot's x becomes one number: none, one of INPUT_REDUCTIONS, or at a time, 0 s first.
 *
 * @param {number} index
 * @param {string} choice
 */
function changeReduce(index, choice) {
  editX(index, { reduce: choice === NONE ? null : choice === AT ? { at: 0 } : choice })
}

/**
 * Sets the time a feature_vs_input plot reads its x at, in seconds from the start of the sub-experiment.
 *
 * @param {number} index
 * @param {string} text
 */
function changeAt(index, text) {
  if (text.trim() === '' || !Number.isFinite(Number(text))) return
  editX(index, { reduce: { at: Number(text) } })
}

/**
 * Whether an input_and_output or output_vs_input plot draws an experiment.
 *
 * @param {Object} plot
 * @param {number} experiment
 * @returns {boolean}
 */
const isDrawn = (plot, experiment) => !Array.isArray(plot.experiments) || plot.experiments.includes(experiment)

/**
 * Whether an experiment is the only one a plot draws, so can't be unticked.
 *
 * @param {Object} plot
 * @param {number} experiment
 * @returns {boolean}
 */
const isOnlyDrawn = (plot, experiment) => {
  const drawn = listPlotExperiments(props.document, plot).filter((index) => experimentChoices.value.some((choice) => choice.index === index))
  return drawn.length === 1 && drawn[0] === experiment
}

/**
 * Ticks or unticks an experiment of an input_and_output or output_vs_input plot; every one ticked leaves experiments
 * out, for all.
 *
 * @param {number} index
 * @param {number} experiment
 * @param {boolean} isTicked
 */
function toggleExperiment(index, experiment, isTicked) {
  const all = experimentChoices.value.map((choice) => choice.index)
  const drawn = new Set(listPlotExperiments(props.document, plots.value[index]))
  if (isTicked) drawn.add(experiment)
  else drawn.delete(experiment)
  const experiments = all.filter((choice) => drawn.has(choice))
  edit(index, { experiments: experiments.length === all.length ? null : experiments })
}

/**
 * Changes a plot's kind, writing that kind's keys alone: what it had that the kind takes, else the first group or
 * input, carrying an input over between kinds.
 *
 * @param {number} index
 * @param {string} kind
 */
function changeKind(index, kind) {
  const plot = plots.value[index]
  const y = typeof plot.y === 'string' && plot.y ? plot.y : (groupNames.value[0] ?? '')
  const key = isInputReference(plot.x) ? plot.x.params_to_change : isMapping(plot.input) ? plot.input.params_to_change : inputKeys.value[0]
  if (kind === 'feature_vs_feature') {
    const x = typeof plot.x === 'string' ? plot.x : (groupNames.value.find((group) => group !== y) ?? groupNames.value[0] ?? null)
    edit(index, { kind, x, y })
  } else if (kind === 'feature_vs_input') {
    const x = isInputReference(plot.x) ? plot.x : key == null ? null : { params_to_change: key, subexperiment_idx: 0 }
    edit(index, { kind, x, y })
  } else {
    edit(index, { kind, input: key == null ? null : { params_to_change: key }, output: typeof plot.output === 'string' ? plot.output : '' })
  }
}

/**
 * Adds a plot of the first group against the first input, else another group, named after them; with no groups, an
 * input_and_output plot of the first input, its output to choose.
 */
function add() {
  const names = new Set(plots.value.map((plot) => plot?.name))
  const named = (base) => {
    let name = base
    for (let suffix = 2; names.has(name); suffix++) name = `${base} (${suffix})`
    return name
  }
  if (!groupNames.value.length) {
    const key = inputKeys.value[0]
    emitDocument(addPredictionPlot(props.document, { name: named(`${key} and output`), kind: 'input_and_output', input: { params_to_change: key }, output: '' }))
    return
  }
  const y = groupNames.value[0]
  const isAgainstInput = inputs.value.length > 0
  const x = isAgainstInput ? inputs.value[0] : (groupNames.value.find((group) => group !== y) ?? y)
  const name = named(`${y} vs ${isAgainstInput ? x.params_to_change : x}`)
  emitDocument(addPredictionPlot(props.document, { name, kind: isAgainstInput ? 'feature_vs_input' : 'feature_vs_feature', x, y }))
}
</script>

<style scoped>
.od-plot-settings {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.4rem;
  min-width: 0;
}

.od-plot-settings > .od-field {
  flex: 1 1 7rem;
}

.od-plot-experiments {
  flex: 2 1 12rem;
  margin: 0;
  padding: 0;
  border: none;
}

.od-plot-experiments legend {
  padding: 0;
}

.od-plot-experiments label {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  margin-right: 0.6rem;
  color: var(--p-text-color, currentColor);
  font-size: 0.78rem;
}
</style>
