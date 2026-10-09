<template>
  <section class="plots-editor" aria-label="Feature plots">
    <header class="plots-head">
      <h5 class="plots-heading">Feature plots</h5>
      <span class="plots-note">A feature across experiments, against another feature or an input: an I–V curve, say.</span>
    </header>

    <Message v-for="message in checked.errors.filter((error) => !checked.plotErrors.flat().includes(error))" :key="message" severity="error" size="small">{{ message }}</Message>

    <ul v-if="plots.length" class="plot-list">
      <li v-for="(plot, index) in plots" :key="index" class="plot" :class="{ 'plot--open': draft?.index === index }">
        <div class="plot-head">
          <span class="plot-name">{{ plot?.name || '(unnamed)' }}</span>
          <span class="plot-chip">{{ describeKind(plot?.kind) }}</span>
          <span class="column-spacer"></span>
          <Button icon="pi pi-pencil" text rounded size="small" severity="secondary" :aria-label="`Edit feature plot ${plot?.name || '(unnamed)'}`" :disabled="!isEditable(plot)" @click="startEditing(index)" />
          <Button icon="pi pi-trash" text rounded size="small" severity="secondary" :aria-label="`Remove feature plot ${plot?.name || '(unnamed)'}`" @click="confirmRemoving(index)" />
        </div>
        <div class="plot-meta">
          <span>{{ describeAxes(plot) }}</span>
          <span v-if="isInputReference(plot?.series)">a line per value of {{ describeInputReference(plot.series) }}</span>
        </div>
        <Message v-for="message in errorsAt(index)" :key="message" severity="error" size="small">{{ message }}</Message>
      </li>
    </ul>
    <p v-else-if="!draft" class="plots-empty">
      {{ groupOptions.length ? 'No feature plots yet.' : 'Add a feature to an output in several experiments to plot it across them.' }}
    </p>

    <form v-if="draft" class="plot-form" :aria-label="draft.index == null ? 'Add a feature plot' : `Edit feature plot ${draft.originalName}`" @submit.prevent="applyDraft">
      <div class="form-fields">
        <label class="form-field">
          Feature (y)
          <Select v-model="draft.y" :options="groupOptions" option-label="label" option-value="value" placeholder="Choose a feature" size="small" aria-label="Feature to plot (y)" />
        </label>
        <label class="form-field">
          Title
          <InputText :model-value="draft.isNameTyped ? draft.name : defaultName" size="small" aria-label="Feature plot title" @update:model-value="typeName" />
        </label>
      </div>

      <div class="form-field">
        <span :id="kindLabelId">Against (x)</span>
        <SelectButton v-model="draft.kind" :options="PREDICTION_PLOT_KINDS" option-label="label" option-value="value" size="small" :allow-empty="false" :aria-labelledby="kindLabelId" />
      </div>
      <div v-if="draft.kind === 'feature_vs_feature'" class="form-fields">
        <label class="form-field">
          Feature (x)
          <Select v-model="draft.xGroup" :options="groupOptions" option-label="label" option-value="value" placeholder="Choose a feature" size="small" aria-label="Feature on x" />
        </label>
      </div>
      <div v-else-if="draft.kind === 'feature_vs_input'" class="form-fields">
        <label class="form-field">
          Input (x)
          <Select v-model="draft.xInput" :options="inputOptions" placeholder="Choose an input" size="small" aria-label="Input on x" />
        </label>
        <label class="form-field">
          Its value in
          <Select v-model="draft.xSub" :options="subOptions" option-label="label" option-value="value" size="small" aria-label="Sub-experiment of the input on x" />
        </label>
      </div>

      <div class="form-field">
        <label class="form-check">
          <Checkbox v-model="draft.hasSeries" binary aria-label="A line per value of an input" />
          A line per value of an input
        </label>
      </div>
      <div v-if="draft.hasSeries" class="form-fields">
        <label class="form-field">
          Input (series)
          <Select v-model="draft.seriesInput" :options="inputOptions" placeholder="Choose an input" size="small" aria-label="Input for the series" />
        </label>
        <label class="form-field">
          Its value in
          <Select v-model="draft.seriesSub" :options="subOptions" option-label="label" option-value="value" size="small" aria-label="Sub-experiment of the input for the series" />
        </label>
      </div>

      <Message v-for="message in shownProblems" :key="message" severity="error" size="small">{{ message }}</Message>

      <div class="form-actions">
        <Button label="Cancel" text size="small" severity="secondary" @click="draft = null" />
        <Button type="submit" :label="draft.index == null ? 'Add feature plot' : 'Apply'" size="small" :disabled="draftProblems.length > 0" />
      </div>
    </form>
    <Button v-else label="Add feature plot" icon="pi pi-plus" text size="small" class="add-plot-button" :disabled="!groupOptions.length" @click="startAdding" />
  </section>
</template>

<script setup>
/**
 * Edits an obs_data document's prediction_plots: each plots a group of features across experiments against another
 * group or an input's value in a sub-experiment, optionally a line per value of another input.
 */
import { computed, ref, useId } from 'vue'

import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'

import {
  PREDICTION_PLOT_KINDS,
  addPredictionPlot,
  describeInputReference,
  isInputReference,
  listFeatureGroups,
  listPredictionPlots,
  removePredictionPlot,
  updatePredictionPlot,
  validatePredictionPlots,
} from '../core/predictionPlots.js'
import { isMapping } from '../core/protocolShapes.js'

const props = defineProps({
  // The obs_data document, with a protocol.
  document: { type: [Object, Array], required: true },
  // Asks before removing a plot: `(options) => Promise<boolean>`.
  confirm: { type: Function, required: true },
})
const emit = defineEmits(['update:document'])

// Labels the x kind's buttons.
const kindLabelId = useId()
const info = computed(() => props.document?.protocol_info ?? {})
const plots = computed(() => listPredictionPlots(props.document))
const checked = computed(() => validatePredictionPlots(props.document))
// The groups a plot can take: those whose items are features, and the draft's own when it names another.
const groupOptions = computed(() => {
  const names = listFeatureGroups(props.document)
    .filter(({ isFeature }) => isFeature)
    .map(({ name }) => name)
  for (const own of [draft.value?.y, draft.value?.xGroup]) if (own && !names.includes(own)) names.push(own)
  return names.map((name) => ({ value: name, label: name }))
})
const inputOptions = computed(() => Object.keys(isMapping(info.value.params_to_change) ? info.value.params_to_change : {}))
// The places any experiment has, from 1.
const subOptions = computed(() =>
  Array.from({ length: Math.max(1, ...(Array.isArray(info.value.sim_times) ? info.value.sim_times : []).map((subs) => (Array.isArray(subs) ? subs.length : 0))) }, (_, sub) => ({
    value: sub,
    label: `Sub-experiment ${sub + 1}`,
  }))
)

/**
 * Words a plot's kind as the list shows it.
 *
 * @param {string} kind
 * @returns {string}
 */
const describeKind = (kind) => ({ feature_vs_feature: 'Against a feature', feature_vs_input: 'Against an input' })[kind] ?? String(kind ?? 'No kind')

/**
 * Words what a plot draws: its y against its x.
 *
 * @param {Object} plot
 * @returns {string}
 */
function describeAxes(plot) {
  if (!isMapping(plot)) return ''
  const x = plot.kind === 'feature_vs_input' && isInputReference(plot.x) ? describeInputReference(plot.x) : plot.x
  return `${plot.y} against ${x}`
}

/**
 * Words a plot's error for its entry, without the `prediction_plots[i] ('name'): ` that names it, in either of
 * Python's quotes.
 *
 * @param {string} message
 * @returns {string}
 */
const describeError = (message) => message.replace(/^prediction_plots\[\d+\](?: \((?:'.*?'|".*?")\))?: /, '')

/**
 * Lists a plot's errors.
 *
 * @param {number} index
 * @returns {string[]}
 */
const errorsAt = (index) => (checked.value.plotErrors[index] ?? []).map(describeError)

/**
 * Whether the form can edit a plot: one of a kind it knows, its x and series as that kind takes them.
 *
 * @param {*} plot
 * @returns {boolean}
 */
function isEditable(plot) {
  if (!isMapping(plot) || !PREDICTION_PLOT_KINDS.some(({ value }) => value === plot.kind)) return false
  const isInput = (reference) => isInputReference(reference) && Number.isInteger(reference.subexperiment_idx)
  if (plot.kind === 'feature_vs_input' && !isInput(plot.x)) return false
  return plot.series == null || isInput(plot.series)
}

/** Passes an edited document on. */
const emitDocument = (document) => emit('update:document', document)

/**
 * Removes a plot, once confirmed.
 *
 * @param {number} index
 */
async function confirmRemoving(index) {
  const isConfirmed = await props.confirm({
    header: `Remove the feature plot ${plots.value[index]?.name || '(unnamed)'}?`,
    message: 'It goes from the file; the features it plots stay.',
    severity: 'warning',
    acceptLabel: 'Remove',
    rejectLabel: 'Keep',
  })
  if (isConfirmed) emitDocument(removePredictionPlot(props.document, index))
}

// The plot being added or edited: `{ index, originalName, name, isNameTyped, y, kind, xGroup, xInput, xSub,
// hasSeries, seriesInput, seriesSub }`; index is null for a new one.
const draft = ref(null)

/** Opens the form for a new plot: a feature against another, x's input and the series in the last sub-experiment. */
function startAdding() {
  const last = subOptions.value.length - 1
  draft.value = { index: null, originalName: null, name: '', isNameTyped: false, y: null, kind: 'feature_vs_feature', xGroup: null, xInput: null, xSub: last, hasSeries: false, seriesInput: null, seriesSub: last }
}

/**
 * Opens the form on a plot.
 *
 * @param {number} index
 */
function startEditing(index) {
  const plot = plots.value[index]
  const last = subOptions.value.length - 1
  const input = (reference) => (isInputReference(reference) ? [reference.params_to_change, reference.subexperiment_idx] : [null, last])
  const [xInput, xSub] = plot.kind === 'feature_vs_input' ? input(plot.x) : [null, last]
  const [seriesInput, seriesSub] = input(plot.series)
  draft.value = {
    index,
    originalName: plot.name,
    name: plot.name ?? '',
    isNameTyped: true,
    y: plot.y ?? null,
    kind: plot.kind,
    xGroup: plot.kind === 'feature_vs_feature' ? plot.x : null,
    xInput,
    xSub,
    hasSeries: plot.series != null,
    seriesInput,
    seriesSub,
  }
}

// The draft's x, as the plot has it.
const draftX = computed(() => {
  const { kind, xGroup, xInput, xSub } = draft.value ?? {}
  if (kind === 'feature_vs_feature') return xGroup
  return kind === 'feature_vs_input' && xInput ? { params_to_change: xInput, subexperiment_idx: xSub } : null
})

// The draft's title until one is typed: y against x.
const defaultName = computed(() => {
  const { y } = draft.value ?? {}
  if (!y || !draftX.value) return ''
  return `${y} vs ${typeof draftX.value === 'string' ? draftX.value : draftX.value.params_to_change}`
})

/**
 * Writes the draft as addPredictionPlot takes it.
 *
 * @returns {Object}
 */
function buildPlot() {
  const { y, kind, hasSeries, seriesInput, seriesSub, isNameTyped, name } = draft.value
  return {
    name: (isNameTyped ? name : defaultName.value).trim(),
    kind,
    x: draftX.value,
    y,
    series: hasSeries && seriesInput ? { params_to_change: seriesInput, subexperiment_idx: seriesSub } : null,
  }
}

/**
 * Applies the draft to the document.
 *
 * @param {Object} plot
 * @returns {Object}
 */
const applyPlot = (plot) => (draft.value.index == null ? addPredictionPlot(props.document, plot) : updatePredictionPlot(props.document, draft.value.index, plot))

// What keeps the draft from being applied: what's missing, then what the plot's checks refuse.
const draftProblems = computed(() => {
  if (!draft.value) return []
  const plot = buildPlot()
  const problems = []
  if (!plot.y) problems.push('Choose the feature to plot.')
  if (plot.kind === 'feature_vs_feature' && !plot.x) problems.push('Choose the feature to plot it against.')
  if (plot.kind === 'feature_vs_input' && !plot.x) problems.push('Choose the input to plot it against.')
  if (draft.value.hasSeries && !plot.series) problems.push('Choose the input whose values each draw a line.')
  // Until one is typed, the title follows the features chosen.
  if (!plot.name && (draft.value.isNameTyped || !problems.length)) problems.push('Give the plot a title.')
  if (problems.length) return problems
  const edited = applyPlot(plot)
  const index = draft.value.index ?? listPredictionPlots(edited).length - 1
  return (validatePredictionPlots(edited).plotErrors[index] ?? []).map(describeError)
})

// The problems shown: none for a new plot until its feature is chosen or a title typed.
const shownProblems = computed(() => (draft.value?.y || draft.value?.isNameTyped || draft.value?.index != null ? draftProblems.value : []))

/**
 * Takes the title typed, which the default no longer replaces.
 *
 * @param {string} name
 */
function typeName(name) {
  Object.assign(draft.value, { name: name ?? '', isNameTyped: true })
}

/** Applies the draft, and closes the form. */
function applyDraft() {
  if (draftProblems.value.length) return
  emitDocument(applyPlot(buildPlot()))
  draft.value = null
}
</script>

<style scoped>
.plots-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}

.plots-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.plots-heading {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--p-text-muted-color, #64748b);
}

.plots-note,
.plots-empty {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color, #64748b);
}

.plot-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.plot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px 8px;
  border: 1px solid var(--p-content-border-color, #e2e8f0);
  border-radius: 8px;
  font-size: 0.8125rem;
}

.plot--open {
  border-color: color-mix(in srgb, var(--p-primary-color, #10b981) 60%, transparent);
}

.plot-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.plot-name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plot-chip {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid var(--p-content-border-color, #e2e8f0);
  border-radius: 999px;
  background: var(--p-content-background, #ffffff);
  font-size: 0.75rem;
}

.column-spacer {
  flex: 1;
}

.plot-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 0.75rem;
  color: var(--p-text-muted-color, #64748b);
}

.plot-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 40rem;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--p-primary-color, #10b981) 60%, transparent);
  border-radius: 8px;
}

.form-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 8px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.8125rem;
}

.form-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.add-plot-button {
  align-self: flex-start;
}
</style>
