<template>
  <section class="outputs-editor" aria-label="Outputs">
    <header class="outputs-head">
      <h4 class="outputs-heading">Outputs</h4>
      <span class="outputs-note">What a run records, as prediction items: a variable's trace, or a feature of it.</span>
    </header>

    <div v-if="checked.warnings.length || sharedErrors.length" class="messages" role="status">
      <Message v-for="message in sharedErrors" :key="message" severity="error" size="small">{{ message }}</Message>
      <Message v-for="message in checked.warnings" :key="message" severity="warn" size="small">{{ message }}</Message>
    </div>

    <ul v-if="outputs.length" class="output-list">
      <li v-for="output in outputs" :key="output.key" class="output" :class="{ 'output--data': output.isValidationData, 'output--open': draft?.key === output.key }">
        <div class="output-head">
          <span class="output-name">{{ output.name }}</span>
          <span class="output-chip">{{ describeOperation(output.operation) }}</span>
          <span v-if="output.isValidationData" class="output-chip output-chip--data" v-tooltip.bottom="'It has measured data (value, std, data_type or obs_dt). The editor leaves it as it is.'">Validation data</span>
          <span class="column-spacer"></span>
          <template v-if="!output.isValidationData">
            <Button
              icon="pi pi-pencil"
              text
              rounded
              size="small"
              severity="secondary"
              :aria-label="`Edit output ${output.name}`"
              :disabled="output.hasRepeatedExperiment"
              @click="startEditing(output)"
            />
            <Button icon="pi pi-trash" text rounded size="small" severity="secondary" :aria-label="`Remove output ${output.name}`" @click="confirmRemovingOutput(output)" />
          </template>
        </div>
        <div class="output-meta">
          <span class="output-path">{{ output.operands.join(', ') }}</span>
          <span v-if="output.unit">{{ output.unit }}</span>
          <span>{{ output.subexperiment == null ? 'over the last sub-experiment' : `over sub-experiment ${output.subexperiment + 1}` }}</span>
          <span v-if="isRangeOperation(output.operation)">{{ describeRange(output.operationKwargs) }}</span>
        </div>
        <div class="output-experiments">
          <span v-for="experiment in output.experiments" :key="experiment" class="output-experiment">
            <span class="output-swatch" :style="{ background: colourAt(experiment) }" aria-hidden="true"></span>{{ nameAt(experiment) }}
          </span>
        </div>
        <p v-if="output.hasRepeatedExperiment && !output.isValidationData" class="output-warning">
          <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
          It has more than one item in an experiment ({{ output.items.map(({ name }) => name).join(', ') }}), so it can't be edited here, as an output
          has one item per experiment. Give each its own item_name_for_plotting in the file to edit them apart.
        </p>
        <p v-else-if="!output.isUniform" class="output-warning">
          <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
          Its items differ in more than their experiment; editing it writes them all alike.
        </p>
        <Message v-for="message in errorsOf(output)" :key="message" severity="error" size="small">{{ message }}</Message>
      </li>
    </ul>
    <p v-else-if="!draft" class="outputs-empty">No outputs yet. Add a variable's trace, or a feature such as its peak in a sub-experiment.</p>

    <form v-if="draft" class="output-form" :aria-label="draft.key ? `Edit output ${draft.originalName}` : 'Add an output'" @submit.prevent="applyDraft">
      <label class="form-field form-field--wide">
        Variable
        <span v-if="draft.variable" class="picked">
          <span class="output-path">{{ draft.variable.name }}</span>
          <span v-if="draft.variable.unit" class="picked-unit">{{ draft.variable.unit }}</span>
          <Button icon="pi pi-times" text rounded size="small" severity="secondary" aria-label="Choose another variable" @click="draft.variable = null" />
        </span>
        <VariablePicker
          v-else
          :variables="variables"
          :filter="isOfferedVariable"
          placeholder="Search for a variable to record…"
          aria-label="Search for a variable to record"
          @pick="pickVariable"
        />
      </label>

      <SelectButton v-model="draft.kind" :options="KINDS" option-label="label" option-value="value" size="small" :allow-empty="false" aria-label="What it records" />

      <div v-if="draft.kind === 'feature'" class="form-fields">
        <label class="form-field">
          Operation
          <Select v-model="draft.operation" :options="operationOptions" option-label="label" option-value="value" size="small" aria-label="Operation" />
        </label>
        <template v-if="isRangeOperation(draft.operation)">
          <label class="form-field">
            From (fraction)
            <NumberInput v-model="draft.startFrac" aria-label="Range start, as a fraction of the sub-experiment" />
          </label>
          <label class="form-field">
            To (fraction, not included)
            <NumberInput v-model="draft.endFrac" aria-label="Range end, as a fraction of the sub-experiment" />
          </label>
        </template>
      </div>

      <div class="form-fields">
        <label class="form-field">
          Name
          <InputText v-model="draft.name" size="small" aria-label="Output name" @input="draft.isNameTyped = true" />
        </label>
        <label class="form-field">
          Sub-experiment
          <Select v-model="draft.subexperiment" :options="subOptions" option-label="label" option-value="value" size="small" aria-label="Sub-experiment" />
        </label>
      </div>

      <fieldset class="form-experiments">
        <legend>Experiments</legend>
        <label v-for="(_, experiment) in experimentCount" :key="experiment" class="form-experiment" :class="{ 'form-experiment--none': !hasSub(experiment) }" :title="hasSub(experiment) ? null : `It has no sub-experiment ${draft.subexperiment + 1}`">
          <Checkbox v-model="draft.experiments" :value="experiment" :disabled="!hasSub(experiment)" :aria-label="nameAt(experiment)" />
          <span class="output-swatch" :style="{ background: colourAt(experiment) }" aria-hidden="true"></span>
          {{ nameAt(experiment) }}
        </label>
      </fieldset>

      <Message v-for="message in draftProblems" :key="message" severity="error" size="small">{{ message }}</Message>

      <div class="form-actions">
        <Button label="Cancel" text size="small" severity="secondary" @click="draft = null" />
        <Button type="submit" :label="draft.key ? 'Apply' : 'Add output'" size="small" :disabled="draftProblems.length > 0" />
      </div>
    </form>
    <Button v-else label="Add output" icon="pi pi-plus" text size="small" class="add-output-button" @click="startAdding" />
  </section>
</template>

<script setup>
/**
 * Edits the outputs an obs_data document records, its prediction_items: each a variable's trace, or a feature of it
 * (an operation over a sub-experiment), in the experiments chosen. Items with measured data are listed as validation
 * data, and left as they are.
 */
import { computed, ref } from 'vue'

import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Tooltip from 'primevue/tooltip'

import NumberInput from './NumberInput.vue'
import VariablePicker from './VariablePicker.vue'
import { isSettable, splitVariableName } from './variableSearch.js'
import { EXPERIMENT_PALETTE, resolveExperimentColour } from '../core/experimentColours.js'
import { OUTPUT_OPERATIONS, addOutput, listOutputs, removeOutput, updateOutput } from '../core/predictionItems.js'
import { isRangeOperation, validatePredictionItems } from '../core/predictionValidation.js'
import { nameExperiment } from '../core/protocolModel.js'

const KINDS = [
  { value: 'trace', label: 'Trace' },
  { value: 'feature', label: 'Feature' },
]

// PrimeVue's tooltips, whether or not the host registers them.
const vTooltip = Tooltip

const props = defineProps({
  // The obs_data document, with a protocol.
  document: { type: [Object, Array], required: true },
  // The model's variables, as the editor's `variables` prop.
  variables: { type: Array, default: () => [] },
  // The time between recorded samples, to check that each range takes some.
  dt: { type: Number, default: null },
  // Asks before removing an output: `(options) => Promise<boolean>`.
  confirm: { type: Function, required: true },
  // The colours of experiments the file doesn't colour, by place.
  palette: { type: Array, default: () => EXPERIMENT_PALETTE },
})
const emit = defineEmits(['update:document'])

const info = computed(() => props.document?.protocol_info ?? {})
const simTimes = computed(() => (Array.isArray(info.value.sim_times) ? info.value.sim_times : []))
const experimentCount = computed(() => simTimes.value.length)
const outputs = computed(() => listOutputs(props.document))
const checked = computed(() => validatePredictionItems(props.document, { dt: props.dt ?? undefined }))
// The errors of no one item: names shared by several.
const sharedErrors = computed(() => checked.value.errors.filter((message) => !checked.value.itemErrors.flat().includes(message)))

/**
 * Names an experiment, as its label or its place.
 *
 * @param {number} experiment
 * @returns {string}
 */
const nameAt = (experiment) => info.value.experiment_labels?.[experiment] ?? nameExperiment(experiment)

/**
 * Colours an experiment as its file does, or by its place.
 *
 * @param {number} experiment
 * @returns {string}
 */
const colourAt = (experiment) => resolveExperimentColour(info.value.experiment_colors?.[experiment], experiment, props.palette)

/**
 * Names an operation, as the editor offers it.
 *
 * @param {string|null} operation
 * @returns {string}
 */
const describeOperation = (operation) => (operation ? (OUTPUT_OPERATIONS.find(({ value }) => value === operation)?.label ?? operation) : 'Trace')

/**
 * Describes the window of an `*_in_range` operation.
 *
 * @param {Object} kwargs
 * @returns {string}
 */
const describeRange = (kwargs) => `from ${kwargs.start_frac ?? 0} to ${kwargs.end_frac ?? 1} of it, the end not included`

/**
 * Lists the errors of an output's items.
 *
 * @param {Object} output - From listOutputs.
 * @returns {string[]}
 */
const errorsOf = (output) => output.items.flatMap(({ index }) => checked.value.itemErrors[index] ?? [])

/** Passes an edited document on. */
const emitDocument = (document) => emit('update:document', document)

/**
 * Removes an output, once confirmed.
 *
 * @param {Object} output - From listOutputs.
 */
async function confirmRemovingOutput(output) {
  const count = output.items.length
  const isConfirmed = await props.confirm({
    header: `Remove the output ${output.name}?`,
    message: `Its ${count === 1 ? 'prediction item goes' : `${count} prediction items go`} from the file (${output.items.map(({ name }) => name).join(', ')}).`,
    severity: 'warning',
    acceptLabel: 'Remove',
    rejectLabel: 'Keep',
  })
  if (isConfirmed) emitDocument(removeOutput(props.document, output.key))
}

// The output being added or edited: `{ key, originalName, variable, kind, operation, startFrac, endFrac, name,
// isNameTyped, traceName, subexperiment, experiments }`; key is null for a new one.
const draft = ref(null)

/** Opens the form for a new output: a trace in every experiment, over its last sub-experiment. */
function startAdding() {
  draft.value = {
    key: null,
    originalName: null,
    variable: null,
    kind: 'trace',
    operation: 'max',
    startFrac: 0,
    endFrac: 1,
    name: '',
    isNameTyped: false,
    traceName: null,
    subexperiment: null,
    experiments: simTimes.value.map((_, experiment) => experiment),
  }
}

/**
 * Opens the form on an output.
 *
 * @param {Object} output - From listOutputs.
 */
function startEditing(output) {
  const [operand] = output.operands
  draft.value = {
    key: output.key,
    originalName: output.name,
    variable: props.variables.find((variable) => variable.name === operand) ?? { name: operand, unit: output.unit },
    kind: output.operation ? 'feature' : 'trace',
    operation: output.operation ?? 'max',
    startFrac: output.operationKwargs.start_frac ?? 0,
    endFrac: output.operationKwargs.end_frac ?? 1,
    name: output.name,
    isNameTyped: true,
    traceName: output.traceName,
    subexperiment: output.subexperiment,
    experiments: [...output.experiments],
    // Kept as they are, unless the operation changes.
    operationKwargs: output.operationKwargs,
  }
}

// CA's operations the editor offers, and the output's own when it is another.
const operationOptions = computed(() => {
  const own = draft.value?.operation
  return own && !OUTPUT_OPERATIONS.some(({ value }) => value === own) ? [...OUTPUT_OPERATIONS, { value: own, label: own }] : OUTPUT_OPERATIONS
})

// Each experiment's last, or one of the places any experiment has, from 1.
const subOptions = computed(() => [
  { value: null, label: 'The last of each experiment' },
  ...Array.from({ length: Math.max(0, ...simTimes.value.map((subs) => (Array.isArray(subs) ? subs.length : 0))) }, (_, sub) => ({ value: sub, label: `Sub-experiment ${sub + 1}` })),
])

/**
 * Whether an experiment has the sub-experiment the draft records over.
 *
 * @param {number} experiment
 * @returns {boolean}
 */
const hasSub = (experiment) => draft.value?.subexperiment == null || draft.value.subexperiment < (simTimes.value[experiment]?.length ?? 0)

/**
 * Whether a variable can be recorded as the draft would: one that changes, or for a mean a constant, which Myokit
 * logs as one value.
 *
 * @param {Object} variable
 * @returns {boolean}
 */
const isOfferedVariable = (variable) => !isSettable(variable) || (draft.value?.kind === 'feature' && draft.value.operation === 'mean')

/**
 * Records a picked variable, labelled as the host labels it, and names the draft after it unless its name was typed.
 *
 * @param {Object} variable - One of `variables`.
 */
function pickVariable(variable) {
  draft.value.variable = variable
  draft.value.traceName = variable.label && variable.label !== variable.name ? variable.label : null
  if (!draft.value.isNameTyped) draft.value.name = splitVariableName(variable.name).name
}

/**
 * Writes the draft as addOutput takes it.
 *
 * @returns {Object|null} Null while it has no variable.
 */
function buildOutput() {
  const { variable, kind, operation, startFrac, endFrac, name, subexperiment, experiments, key, traceName } = draft.value
  if (!variable) return null
  const isFeature = kind === 'feature'
  const isSameOperation = key && operation === outputs.value.find((output) => output.key === key)?.operation
  const operationKwargs = !isFeature ? {} : isRangeOperation(operation) ? { start_frac: startFrac, end_frac: endFrac } : isSameOperation ? draft.value.operationKwargs : {}
  return {
    name: name.trim(),
    operands: [variable.name],
    unit: variable.unit ?? '',
    experiments: experiments.filter(hasSub).sort((a, b) => a - b),
    subexperiment,
    operation: isFeature ? operation : null,
    operationKwargs,
    traceName,
  }
}

/**
 * Applies the draft to the document.
 *
 * @param {Object} output
 * @returns {Object}
 */
const applyOutput = (output) => (draft.value.key ? updateOutput(props.document, draft.value.key, output) : addOutput(props.document, output))

// What keeps the draft from being applied: what's missing, then what CA or the range would refuse of its items.
const draftProblems = computed(() => {
  if (!draft.value) return []
  const output = buildOutput()
  if (!output) return ['Choose a variable to record.']
  const problems = []
  if (!output.name) problems.push('Name the output.')
  else if (outputs.value.some(({ key, name }) => key !== draft.value.key && key.startsWith('output:') && name === output.name)) problems.push(`An output is already named ${output.name}.`)
  if (!output.experiments.length) problems.push('Choose an experiment.')
  if (isSettable(draft.value.variable) && !(output.operation === 'mean')) problems.push(`${output.operands[0]} is a parameter: only its mean can be recorded.`)
  if (problems.length) return problems
  const edited = applyOutput(output)
  const { itemErrors, errors } = validatePredictionItems(edited, { dt: props.dt ?? undefined })
  const before = new Set(checked.value.errors)
  // The errors the draft brings, CA's message for each of its items.
  return [...new Set([...itemErrors.flat(), ...errors].filter((message) => !before.has(message)))]
})

/** Applies the draft, and closes the form. */
function applyDraft() {
  if (draftProblems.value.length) return
  emitDocument(applyOutput(buildOutput()))
  draft.value = null
}
</script>

<style scoped>
.outputs-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--p-content-border-color, #e2e8f0);
}

.outputs-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.outputs-heading {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--p-text-muted-color, #64748b);
}

.outputs-note,
.outputs-empty {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color, #64748b);
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.output-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.output {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px 8px;
  border: 1px solid var(--p-content-border-color, #e2e8f0);
  border-radius: 8px;
  font-size: 0.8125rem;
}

.output--open {
  border-color: color-mix(in srgb, var(--p-primary-color, #10b981) 60%, transparent);
}

.output--data {
  background: color-mix(in srgb, var(--p-content-hover-background, #f1f5f9) 60%, transparent);
}

.output-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.output-name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.output-chip {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid var(--p-content-border-color, #e2e8f0);
  border-radius: 999px;
  background: var(--p-content-background, #ffffff);
  font-size: 0.75rem;
}

.output-chip--data {
  border-color: var(--p-orange-400, #fb923c);
}

.column-spacer {
  flex: 1;
}

.output-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 0.75rem;
  color: var(--p-text-muted-color, #64748b);
}

.output-path {
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.output-experiments {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 0.75rem;
}

.output-experiment {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.output-swatch {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.output-warning {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color, #64748b);
}

.output-warning .pi {
  color: var(--p-orange-500, #f97316);
}

.output-form {
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

.picked {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.picked-unit {
  font-size: 0.75rem;
  color: var(--p-text-muted-color, #64748b);
}

.form-experiments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 0.8125rem;
}

.form-experiments legend {
  margin-bottom: 4px;
  padding: 0;
}

.form-experiment {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.form-experiment--none {
  opacity: 0.5;
  cursor: default;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.add-output-button {
  align-self: flex-start;
}
</style>
