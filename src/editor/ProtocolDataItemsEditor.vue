<template>
  <section class="data-items-editor" aria-label="Data items">
    <header class="data-items-head">
      <h4 class="data-items-heading">Data items</h4>
      <span class="data-items-note">{{ isEditable ? 'The measured data a calibration fits the model to: each a variable, or a feature of it, in a sub-experiment.' : 'The measured data in the file, which a calibration fits the model to.' }}</span>
    </header>

    <div v-if="isEditable && sharedErrors.length" class="messages" role="status">
      <Message v-for="message in sharedErrors" :key="message" severity="error" size="small">{{ message }}</Message>
    </div>

    <ul v-if="items.length" class="data-item-list">
      <li v-for="item in items" :key="item.index" class="data-item" :class="{ 'data-item--compact': !isEditable, 'data-item--open': draft?.index === item.index }">
        <div class="data-item-head">
          <span class="data-item-name">{{ item.name || '(unnamed)' }}</span>
          <span v-if="isShown('dataType')" class="data-item-chip">{{ item.dataType }}</span>
          <span v-if="isShown('operation')" class="data-item-chip">{{ item.operation || 'No operation' }}</span>
          <span class="column-spacer"></span>
          <template v-if="isEditable">
            <Button icon="pi pi-pencil" text rounded size="small" severity="secondary" :aria-label="`Edit data item ${item.name}`" @click="startEditing(item)" />
            <Button icon="pi pi-trash" text rounded size="small" severity="secondary" :aria-label="`Remove data item ${item.name}`" @click="confirmRemovingItem(item)" />
          </template>
        </div>
        <div class="data-item-meta">
          <span v-if="isShown('variable') && item.operands.length" class="data-item-path">{{ item.operands.join(', ') }}</span>
          <span v-if="isShown('unit') && item.unit">{{ item.unit }}</span>
          <span v-if="isShown('experiment')" class="data-item-experiment">
            <span class="data-item-swatch" :style="{ background: colourAt(item.experiment) }" aria-hidden="true"></span>{{ nameAt(item.experiment) }}
          </span>
          <span v-if="isShown('subexperiment')">sub-experiment {{ item.subexperiment + 1 }}</span>
          <span v-if="isShown('value')">{{ describeValue(item) }}</span>
          <span v-if="isShown('weight') && item.weight !== 1">weight {{ item.weight }}</span>
          <span v-if="isShown('cost')">{{ item.costType ? `cost ${item.costType}` : `cost ${vocabulary.defaultCostType} (default)` }}</span>
          <span v-if="isShown('plot') && item.plotType != null">{{ item.plotType ? `plotted ${item.plotType}` : 'no marker' }}</span>
          <span v-if="isShown('source') && item.source">{{ item.source }}</span>
          <span v-if="isShown('comment') && item.comment" class="data-item-comment">{{ item.comment }}</span>
        </div>
        <template v-if="isEditable">
          <Message v-for="message in problemsOf(item, 'itemErrors')" :key="message" severity="error" size="small">{{ message }}</Message>
          <Message v-for="message in problemsOf(item, 'itemWarnings')" :key="message" severity="warn" size="small">{{ message }}</Message>
        </template>
      </li>
    </ul>
    <p v-else-if="!draft" class="data-items-empty">{{ isEditable ? 'No data items yet. Add a measurement to calibrate the model against.' : 'No data items.' }}</p>

    <form v-if="draft" class="data-item-form" :aria-label="draft.index == null ? 'Add a data item' : `Edit data item ${draft.originalName}`" @submit.prevent="applyDraft">
      <div class="form-fields">
        <label v-if="isShown('name')" class="form-field">
          Name
          <InputText v-model="row.name" size="small" aria-label="Data item name" @input="draft.isNameTyped = true" />
        </label>
        <label v-if="isShown('dataType')" class="form-field">
          Data type
          <Select :model-value="row.dataType" :options="dataTypeOptions" size="small" aria-label="Data type" @update:model-value="changeDataType" />
        </label>
        <label v-if="isShown('unit')" class="form-field">
          Unit
          <InputText v-model="row.unit" size="small" aria-label="Unit" @input="draft.isUnitTyped = true" />
        </label>
      </div>

      <div v-if="isShown('operation')" class="form-fields">
        <label class="form-field">
          Operation
          <Select :model-value="row.operation" :options="operationOptions" option-label="label" option-value="value" filter size="small" aria-label="Operation" @update:model-value="changeOperation" />
        </label>
      </div>
      <p v-if="isShown('operation') && operationSpec && !operationSpec.differentiable" class="form-note">
        <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
        {{ row.operation }} is not differentiable: gradient-based calibration falls back to finite differences.
      </p>

      <div v-if="isShown('variable')" class="form-field form-field--wide" role="group" :aria-label="operandSlots.length === 1 ? 'Variable' : 'Variables'">
        <span>{{ operandSlots.length === 1 ? 'Variable' : 'Variables' }}</span>
        <div v-for="(slot, position) in operandSlots" :key="position" class="operand">
          <span v-if="slot.label" class="operand-label">{{ slot.label }}</span>
          <span v-if="row.operands[position]" class="picked">
            <span class="data-item-path">{{ row.operands[position] }}</span>
            <Button icon="pi pi-times" text rounded size="small" severity="secondary" :aria-label="`Choose another variable for ${slot.label || `operand ${position + 1}`}`" @click="setOperand(position, '')" />
          </span>
          <VariablePicker
            v-else
            :variables="variables"
            placeholder="Search for a variable…"
            :aria-label="`Search for a variable for ${slot.label || `operand ${position + 1}`}`"
            @pick="(variable) => pickOperand(position, variable)"
          />
        </div>
        <p v-if="!operandSlots.length" class="form-note">{{ row.operation }} reads no variable: its arguments name other data items.</p>
        <Button v-if="canAddOperand" label="Add variable" icon="pi pi-plus" text size="small" class="add-operand-button" @click="row.operands.push('')" />
      </div>

      <fieldset v-if="isShown('operation') && operationKwargFields.length" class="form-group">
        <legend>Operation arguments</legend>
        <div class="form-fields">
          <label v-for="field in operationKwargFields" :key="field.name" class="form-field">
            {{ field.name }}
            <Checkbox v-if="field.type === 'boolean'" :model-value="!!(row.operationKwargs[field.name] ?? field.default)" binary :aria-label="field.name" @update:model-value="(value) => (row.operationKwargs[field.name] = value)" />
            <Select
              v-else-if="field.type === 'data_item'"
              :model-value="row.operationKwargs[field.name] ?? ''"
              :options="referenceOptions(field.name)"
              option-label="label"
              option-value="value"
              size="small"
              :aria-label="field.name"
              @update:model-value="(value) => setKwarg('operationKwargs', field, value)"
            />
            <InputText v-else :model-value="kwargText('operationKwargs', field.name)" size="small" :placeholder="formatDefault(field.default)" :aria-label="field.name" :invalid="isKwargInvalid('operationKwargs', field)" @update:model-value="(text) => setKwargText('operationKwargs', field, text)" />
          </label>
        </div>
      </fieldset>

      <div class="form-fields">
        <label v-if="isShown('experiment')" class="form-field">
          Experiment
          <Select :model-value="row.experiment" :options="experimentOptions" option-label="label" option-value="value" size="small" aria-label="Experiment" @update:model-value="changeExperiment" />
        </label>
        <label v-if="isShown('subexperiment')" class="form-field">
          Sub-experiment
          <Select v-model="row.subexperiment" :options="subOptions" option-label="label" option-value="value" size="small" aria-label="Sub-experiment" />
        </label>
        <label v-if="isShown('weight')" class="form-field">
          Weight
          <NumberInput v-model="row.weight" aria-label="Weight" @invalid="(invalid) => (draft.invalid.weight = invalid)" />
        </label>
      </div>

      <template v-if="isShown('value')">
        <p v-if="!row.isValueEditable" class="form-note">{{ row.dataType === 'frequency' ? "A frequency's values are kept as they are." : 'Its values are read from files, and kept as they are.' }}</p>
        <label v-else-if="isDistribution" class="form-field">
          Distribution (prob_dist_params, as JSON)
          <Textarea v-model="draft.texts.probDist" rows="2" auto-resize aria-label="Distribution, as JSON" :invalid="parsedProbDist === undefined" />
        </label>
        <div v-else-if="row.dataType === 'series'" class="form-fields">
          <label class="form-field form-field--wide">
            Values
            <InputText v-model="draft.texts.value" size="small" placeholder="1.5, 2, 2.5" aria-label="Values, separated by commas" :invalid="parsedValues === undefined" />
          </label>
          <label class="form-field">
            Std
            <InputText v-model="draft.texts.std" size="small" placeholder="One, or one per value" aria-label="Standard deviation, one or one per value" :invalid="parsedStd === undefined" />
          </label>
          <label class="form-field">
            Time between values (obs_dt)
            <NumberInput v-model="row.obsDt" aria-label="Time between values" @invalid="(invalid) => (draft.invalid.obsDt = invalid)" />
          </label>
        </div>
        <div v-else class="form-fields">
          <label class="form-field">
            Value
            <NumberInput v-model="row.value" aria-label="Value" @invalid="(invalid) => (draft.invalid.value = invalid)" />
          </label>
          <label class="form-field">
            Std
            <NumberInput v-model="row.std" aria-label="Standard deviation" @invalid="(invalid) => (draft.invalid.std = invalid)" />
          </label>
        </div>
      </template>

      <template v-if="isShown('cost')">
        <div class="form-fields">
          <label class="form-field">
            Cost
            <Select :model-value="row.costType" :options="costOptions" option-label="label" option-value="value" size="small" aria-label="Cost" @update:model-value="changeCostType" />
          </label>
        </div>
        <fieldset v-if="costKwargFields.length" class="form-group">
          <legend>Cost arguments</legend>
          <div class="form-fields">
            <label v-for="field in costKwargFields" :key="field.name" class="form-field">
              {{ field.name }}
              <Checkbox v-if="field.type === 'boolean'" :model-value="!!(row.costKwargs[field.name] ?? field.default)" binary :aria-label="field.name" @update:model-value="(value) => (row.costKwargs[field.name] = value)" />
              <InputText v-else :model-value="kwargText('costKwargs', field.name)" size="small" :placeholder="formatDefault(field.default)" :aria-label="field.name" :invalid="isKwargInvalid('costKwargs', field)" @update:model-value="(text) => setKwargText('costKwargs', field, text)" />
            </label>
          </div>
        </fieldset>
      </template>

      <div v-if="isShown('plot')" class="form-fields">
        <label class="form-field">
          Plot
          <Select
            :model-value="row.plotType ?? DEFAULT_PLOT"
            :options="plotOptions"
            option-label="label"
            option-value="value"
            size="small"
            aria-label="Plot type"
            @update:model-value="(value) => (row.plotType = value === DEFAULT_PLOT ? null : value)"
          />
        </label>
        <label class="form-field">
          Colour
          <InputText v-model="row.plotColor" size="small" placeholder="The experiment's" aria-label="Plot colour" />
        </label>
        <label class="form-field">
          Trace label
          <InputText v-model="row.traceName" size="small" :placeholder="defaultTraceName" aria-label="Trace label" />
        </label>
        <label class="form-field">
          Item label
          <InputText v-model="row.itemName" size="small" :placeholder="defaultItemName" aria-label="Item label" />
        </label>
      </div>

      <div v-if="isShown('source') || isShown('comment')" class="form-fields">
        <label v-if="isShown('source')" class="form-field form-field--wide">
          Source
          <InputText v-model="row.source" size="small" :placeholder="isMapping(row.original?.source) ? 'Files, kept as they are' : 'Where the data came from'" aria-label="Source" />
        </label>
        <label v-if="isShown('comment')" class="form-field form-field--wide">
          Comment
          <InputText v-model="row.comment" size="small" aria-label="Comment" />
        </label>
      </div>

      <Message v-for="message in shownProblems" :key="message" severity="error" size="small">{{ message }}</Message>

      <div class="form-actions">
        <Button label="Cancel" text size="small" severity="secondary" @click="draft = null" />
        <Button type="submit" :label="draft.index == null ? 'Add data item' : 'Apply'" size="small" :disabled="draftProblems.length > 0" />
      </div>
    </form>
    <Button v-else-if="isEditable" label="Add data item" icon="pi pi-plus" text size="small" class="add-data-item-button" @click="startAdding" />
  </section>
</template>

<script setup>
/**
 * Lists the measured data an obs_data document calibrates against, its data_items, and edits them. The host chooses
 * the columns shown (`columns`): all of them, as a calibration needs, or a summary that lists each item's variable and
 * where it is measured, read-only. Each item is checked as circulatory_autogen #536 reads it, its errors inline.
 */
import { computed, ref } from 'vue'

import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'

import NumberInput from './NumberInput.vue'
import VariablePicker from './VariablePicker.vue'
import { isSummaryColumns, resolveDataItemColumns } from './dataItemColumns.js'
import { splitVariableName } from './variableSearch.js'
import { addDataItem, createDataItem, listDataItems, removeDataItem, updateDataItem } from '../core/dataItems.js'
import { validateDataItems } from '../core/dataItemValidation.js'
import { DATA_ITEM_COST_TYPES, DATA_ITEM_VOCABULARY } from '../core/dataItemVocabulary.js'
import { EXPERIMENT_PALETTE, resolveExperimentColour } from '../core/experimentColours.js'
import { nameExperiment } from '../core/protocolModel.js'
import { isMapping } from '../core/protocolShapes.js'

// The Select's value for the data type's default plot, which the row holds as null: a Select shows null as nothing chosen.
const DEFAULT_PLOT = 'default'
// The plot type each data type is drawn with by default.
const PLOT_OF = { constant: 'horizontal', series: 'series', frequency: 'frequency' }
// The number fields, as a problem names them.
const FIELD_NAMES = { value: 'value', std: 'std', weight: 'weight', obsDt: 'time between values' }

const props = defineProps({
  // The obs_data document.
  document: { type: [Object, Array], required: true },
  // The model's variables, as the editor's `variables` prop, for the variables an item reads.
  variables: { type: Array, default: () => [] },
  // Asks before removing a data item: `(options) => Promise<boolean>`.
  confirm: { type: Function, required: true },
  // The colours of experiments the file doesn't colour, by place.
  palette: { type: Array, default: () => EXPERIMENT_PALETTE },
  // The columns shown: 'all', 'summary' (name, variable, experiment, sub-experiment), or a list of their keys
  // (DATA_ITEM_COLUMNS).
  columns: { type: [String, Array], default: 'all' },
  // Whether the items are only listed; by default, when the columns are only the summary's.
  readOnly: { type: Boolean, default: null },
  // The operations, cost funcs, data and plot types offered, as DATA_ITEM_VOCABULARY (readObsDataOptions reads
  // CUFLynx's).
  vocabulary: { type: Object, default: () => DATA_ITEM_VOCABULARY },
})
const emit = defineEmits(['update:document'])

const shownColumns = computed(() => resolveDataItemColumns(props.columns))
const isEditable = computed(() => !(props.readOnly ?? isSummaryColumns(shownColumns.value)))
const info = computed(() => (isMapping(props.document) ? (props.document.protocol_info ?? {}) : {}))
const simTimes = computed(() => (Array.isArray(info.value.sim_times) ? info.value.sim_times : []))
const items = computed(() => listDataItems(props.document))
const checked = computed(() => (isEditable.value ? validateDataItems(props.document, { vocabulary: props.vocabulary }) : null))
const sharedErrors = computed(() => checked.value?.sharedErrors ?? [])

/**
 * Whether a column is shown.
 *
 * @param {string} key
 * @returns {boolean}
 */
const isShown = (key) => shownColumns.value.includes(key)

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
 * Finds a cost func, among the host's or CA's own, those that combine costs included.
 *
 * @param {string} name
 * @returns {Object|undefined}
 */
const findCostType = (name) => props.vocabulary.costTypes?.find((entry) => entry.name === name) ?? DATA_ITEM_COST_TYPES.find((entry) => entry.name === name)

/**
 * Whether an item's cost scores it against a distribution, not a value.
 *
 * @param {Object} item - A row.
 * @returns {boolean}
 */
const isScoredByDistribution = (item) => findCostType(item.costType || props.vocabulary.defaultCostType)?.groundTruth === 'distribution'

/**
 * Describes what an item measured.
 *
 * @param {Object} item - From listDataItems.
 * @returns {string}
 */
function describeValue(item) {
  if (isScoredByDistribution(item)) return 'a distribution'
  if (item.dataType === 'frequency') return 'a frequency response'
  if (!item.isValueEditable) return 'values from files'
  if (Array.isArray(item.value)) return `${item.value.length} values${item.obsDt != null ? ` every ${item.obsDt}` : ''}`
  return `${item.value ?? '–'} ± ${Array.isArray(item.std) ? item.std.join(', ') : (item.std ?? '–')}`
}

/**
 * Words an item's message for its place in the list: without CA's `data_items[i] ('name')`.
 *
 * @param {string} message - CA's.
 * @returns {string}
 */
const describeItemMessage = (message) => message.replace(/^data_items\[\d+\] \('.*?'\)(: | )/, (_, separator) => (separator === ': ' ? '' : 'It '))

/**
 * Lists an item's errors or warnings.
 *
 * @param {Object} item - From listDataItems.
 * @param {'itemErrors'|'itemWarnings'} kind
 * @returns {string[]}
 */
const problemsOf = (item, kind) => (checked.value?.[kind][item.index] ?? []).map(describeItemMessage)

/** Passes an edited document on. */
const emitDocument = (document) => emit('update:document', document)

/**
 * Removes a data item, once confirmed.
 *
 * @param {Object} item - From listDataItems.
 */
async function confirmRemovingItem(item) {
  const isConfirmed = await props.confirm({
    header: `Remove the data item ${item.name}?`,
    message: 'It goes from the file, with its measured data.',
    severity: 'warning',
    acceptLabel: 'Remove',
    rejectLabel: 'Keep',
  })
  if (isConfirmed) emitDocument(removeDataItem(props.document, item.index))
}

// The item being added or edited: `{ index, originalName, row, isNameTyped, isUnitTyped, texts, kwargTexts, invalid }`;
// index is null for a new one. `row` is as readDataItem gives; `texts` holds a series' values and std and a
// distribution as typed, `kwargTexts` the kwargs typed, and `invalid` which number fields read as no number.
const draft = ref(null)
const row = computed(() => draft.value?.row)

/**
 * Writes a number or a list as a field shows it.
 *
 * @param {*} value
 * @returns {string}
 */
const formatList = (value) => (Array.isArray(value) ? value.join(', ') : value == null ? '' : String(value))

/**
 * Opens the form on a row.
 *
 * @param {Object} opened - As readDataItem gives.
 * @param {number|null} index
 */
function openDraft(opened, index) {
  draft.value = {
    index,
    originalName: opened.name,
    row: { ...opened, operands: [...opened.operands], operationKwargs: { ...opened.operationKwargs }, costKwargs: { ...opened.costKwargs } },
    isNameTyped: index != null,
    isUnitTyped: index != null,
    texts: {
      value: formatList(opened.value),
      std: formatList(opened.std),
      probDist: opened.probDistParams ? JSON.stringify(opened.probDistParams) : '',
    },
    kwargTexts: { operationKwargs: {}, costKwargs: {} },
    invalid: {},
  }
  fitOperands({ isGrowOnly: true })
}

/** Opens the form for a new data item, in the first experiment and sub-experiment. */
const startAdding = () => openDraft(createDataItem(), null)

/**
 * Opens the form on a data item.
 *
 * @param {Object} item - From listDataItems.
 */
const startEditing = (item) => openDraft(item, item.index)

const dataTypeOptions = computed(() => [...new Set([...props.vocabulary.dataTypes, row.value?.dataType].filter(Boolean))])

/**
 * Changes the data type; a new item's plot follows it.
 *
 * @param {string} dataType
 */
function changeDataType(dataType) {
  if (draft.value.index == null && row.value.plotType === PLOT_OF[row.value.dataType]) row.value.plotType = PLOT_OF[dataType] ?? row.value.plotType
  row.value.dataType = dataType
}

// The operations offered, and the item's own when it is another.
const operationOptions = computed(() => {
  const options = [{ value: '', label: 'No operation' }, ...props.vocabulary.operations.map(({ name }) => ({ value: name, label: name }))]
  const own = row.value?.operation
  return own && !options.some(({ value }) => value === own) ? [...options, { value: own, label: own }] : options
})
const operationSpec = computed(() => props.vocabulary.operations.find(({ name }) => name === row.value?.operation) ?? null)

// The variables the item reads: one per argument its operation fills from them, or as many as it has.
const operandSlots = computed(() => {
  const spec = operationSpec.value
  const count = spec && !spec.acceptsAny ? Math.max(spec.operands.length, row.value.operands.length) : Math.max(row.value.operands.length, row.value.operation ? 0 : 1)
  return Array.from({ length: count }, (_, position) => ({ label: spec?.operands[position] ?? '' }))
})
const canAddOperand = computed(() => !operationSpec.value || operationSpec.value.acceptsAny)

/**
 * Gives the item as many variables as its operation fills, keeping those chosen in their place.
 *
 * @param {Object} [options]
 * @param {boolean} [options.isGrowOnly] - Keeps variables past the count, as a file opened may have them.
 */
function fitOperands({ isGrowOnly = false } = {}) {
  const spec = operationSpec.value
  if (!spec || spec.acceptsAny) return
  const { operands } = row.value
  while (operands.length < spec.operands.length) operands.push('')
  if (!isGrowOnly && operands.length > spec.operands.length) operands.splice(spec.operands.length)
}

/**
 * Lists the kwargs a group's func takes, then those the item has that it doesn't know of.
 *
 * @param {Object|null} spec - An operation or cost func.
 * @param {Object} kwargs - The item's.
 * @returns {Array<{name: string, default: *, type: string}>} An unknown one is of type 'any'.
 */
function listKwargFields(spec, kwargs) {
  const fields = spec?.kwargs ?? []
  const extra = Object.keys(kwargs)
    .filter((name) => !fields.some((field) => field.name === name))
    .map((name) => ({ name, default: null, type: 'any' }))
  return [...fields, ...extra]
}

/**
 * Drops the kwargs a func doesn't take, when it says what it takes.
 *
 * @param {Object|null} spec
 * @param {'operationKwargs'|'costKwargs'} group
 */
function dropUnknownKwargs(spec, group) {
  if (!spec || spec.acceptsAny) return
  const names = new Set(spec.kwargs.map(({ name }) => name))
  for (const name of Object.keys(row.value[group])) {
    if (names.has(name)) continue
    delete row.value[group][name]
    delete draft.value.kwargTexts[group][name]
  }
}

/**
 * Changes the operation, dropping the kwargs it doesn't take and fitting the variables to it.
 *
 * @param {string} operation
 */
function changeOperation(operation) {
  row.value.operation = operation
  if (operation) dropUnknownKwargs(operationSpec.value, 'operationKwargs')
  fitOperands()
}

const operationKwargFields = computed(() => (row.value?.operation ? listKwargFields(operationSpec.value, row.value.operationKwargs) : []))

/**
 * The other items an operation's argument may name, and the one it names when that is none of them.
 *
 * @param {string} name - The argument.
 * @returns {Array<{value: string, label: string}>}
 */
function referenceOptions(name) {
  const names = items.value.filter((item) => item.index !== draft.value.index && item.name).map((item) => item.name)
  const stored = row.value.operationKwargs[name]
  if (typeof stored === 'string' && stored && !names.includes(stored)) names.push(stored)
  return [{ value: '', label: 'None' }, ...names.map((item) => ({ value: item, label: item }))]
}

/**
 * Writes a kwarg's default as a field's placeholder.
 *
 * @param {*} value
 * @returns {string}
 */
const formatDefault = (value) => (value == null ? '' : `${value} by default`)

/**
 * The text of a kwarg's field: as typed, else its value.
 *
 * @param {'operationKwargs'|'costKwargs'} group
 * @param {string} name
 * @returns {string}
 */
function kwargText(group, name) {
  const typed = draft.value.kwargTexts[group][name]
  if (typed !== undefined) return typed
  const value = row.value[group][name]
  return value == null ? '' : isMapping(value) || Array.isArray(value) ? JSON.stringify(value) : String(value)
}

/**
 * Reads a kwarg's text as its type: a number, a string, or for one the func doesn't name, a number, boolean or string.
 *
 * @param {{type: string}} field
 * @param {string} text
 * @returns {*} Undefined for text that is no value of its type, null for none.
 */
function readKwarg(field, text) {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (field.type === 'string') return text
  const number = Number(trimmed)
  if (Number.isFinite(number)) return number
  if (field.type === 'number') return undefined
  return trimmed === 'True' || trimmed === 'true' ? true : trimmed === 'False' || trimmed === 'false' ? false : text
}

/**
 * Sets or clears a kwarg.
 *
 * @param {'operationKwargs'|'costKwargs'} group
 * @param {{name: string}} field
 * @param {*} value - Null or '' for none.
 */
function setKwarg(group, field, value) {
  if (value == null || value === '') delete row.value[group][field.name]
  else row.value[group][field.name] = value
}

/**
 * Keeps a kwarg's text as typed, and its value once it reads as one.
 *
 * @param {'operationKwargs'|'costKwargs'} group
 * @param {Object} field
 * @param {string} text
 */
function setKwargText(group, field, text) {
  draft.value.kwargTexts[group][field.name] = text
  const value = readKwarg(field, text)
  if (value !== undefined) setKwarg(group, field, value)
}

/**
 * Whether a kwarg's text reads as no value of its type.
 *
 * @param {'operationKwargs'|'costKwargs'} group
 * @param {Object} field
 * @returns {boolean}
 */
function isKwargInvalid(group, field) {
  const typed = draft.value.kwargTexts[group][field.name]
  return typed !== undefined && readKwarg(field, typed) === undefined
}

/**
 * Lists the kwargs fields whose text reads as no value.
 *
 * @returns {string[]} Their names.
 */
const listInvalidKwargs = () =>
  [
    ['operationKwargs', operationKwargFields.value],
    ['costKwargs', costKwargFields.value],
  ].flatMap(([group, fields]) => fields.filter((field) => isKwargInvalid(group, field)).map(({ name }) => name))

/**
 * Picks the variable an item reads in a place; the first names a new item, and gives its unit, unless they were typed.
 *
 * @param {number} position
 * @param {Object} variable - One of `variables`.
 */
function pickOperand(position, variable) {
  setOperand(position, variable.name)
  if (position > 0) return
  if (!draft.value.isNameTyped) row.value.name = splitVariableName(variable.name).name
  if (!draft.value.isUnitTyped && variable.unit) row.value.unit = variable.unit
}

/**
 * Sets the variable read in a place, or clears it for ''.
 *
 * @param {number} position
 * @param {string} name
 */
const setOperand = (position, name) => (row.value.operands[position] = name)

// Each experiment, or the one of a document with no protocol.
const experimentOptions = computed(() => Array.from({ length: Math.max(1, simTimes.value.length) }, (_, experiment) => ({ value: experiment, label: nameAt(experiment) })))
const subOptions = computed(() => {
  const subs = simTimes.value[row.value?.experiment]
  return Array.from({ length: Math.max(1, Array.isArray(subs) ? subs.length : 0) }, (_, sub) => ({ value: sub, label: `Sub-experiment ${sub + 1}` }))
})

/**
 * Changes the experiment, keeping the sub-experiment within its own.
 *
 * @param {number} experiment
 */
function changeExperiment(experiment) {
  row.value.experiment = experiment
  const subs = simTimes.value[experiment]
  const count = Array.isArray(subs) ? subs.length : 1
  if (row.value.subexperiment >= count) row.value.subexperiment = Math.max(0, count - 1)
}

const isDistribution = computed(() => !!row.value && isScoredByDistribution(row.value))

/**
 * Reads a list of numbers, separated by commas or spaces.
 *
 * @param {string} text
 * @returns {number[]|undefined} Undefined for any that is no number.
 */
function readNumbers(text) {
  const numbers = text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number)
  return numbers.every(Number.isFinite) ? numbers : undefined
}

const parsedValues = computed(() => (draft.value ? readNumbers(draft.value.texts.value) : []))
// One std for every value, or one per value; null for none.
const parsedStd = computed(() => {
  if (!draft.value?.texts.std.trim()) return null
  const numbers = readNumbers(draft.value.texts.std)
  return numbers?.length === 1 ? numbers[0] : numbers
})
const parsedProbDist = computed(() => {
  const text = draft.value?.texts.probDist.trim()
  if (!text) return null
  try {
    const value = JSON.parse(text)
    return isMapping(value) ? value : undefined
  } catch {
    return undefined
  }
})

const costOptions = computed(() => {
  const tags = ({ isMLE, differentiable }) => [isMLE && 'MLE', differentiable && 'AD'].filter(Boolean).join(', ')
  const options = [
    { value: '', label: `Default (${props.vocabulary.defaultCostType})` },
    ...props.vocabulary.costTypes.map((cost) => ({ value: cost.name, label: tags(cost) ? `${cost.name} (${tags(cost)})` : cost.name })),
  ]
  const own = row.value?.costType
  return own && !options.some(({ value }) => value === own) ? [...options, { value: own, label: own }] : options
})
const costSpec = computed(() => (row.value ? (findCostType(row.value.costType || props.vocabulary.defaultCostType) ?? null) : null))
const costKwargFields = computed(() => (row.value ? listKwargFields(costSpec.value, row.value.costKwargs) : []))

/**
 * Changes the cost, dropping the kwargs it doesn't take.
 *
 * @param {string} costType
 */
function changeCostType(costType) {
  row.value.costType = costType
  dropUnknownKwargs(costSpec.value, 'costKwargs')
}

const plotOptions = computed(() => {
  const options = [
    { value: DEFAULT_PLOT, label: `Default (${PLOT_OF[row.value?.dataType] ?? 'none'})` },
    { value: '', label: 'No marker' },
    ...props.vocabulary.plotTypes.map((plotType) => ({ value: plotType, label: plotType })),
  ]
  const own = row.value?.plotType
  return own && !options.some(({ value }) => value === own) ? [...options, { value: own, label: own }] : options
})
// CA's labels for an item that sets none.
const defaultTraceName = computed(() => row.value?.operands.find(Boolean) || row.value?.name || '')
const defaultItemName = computed(() => (row.value?.operation ? `${row.value.traceName || defaultTraceName.value} (${row.value.operation})` : row.value?.traceName || defaultTraceName.value))

/**
 * Writes the draft as updateDataItem takes it: a series' values, its std and a distribution as read from their text.
 *
 * @returns {Object}
 */
function buildRow() {
  const { original, isValueEditable, ...fields } = row.value
  if (!isShown('value') || !isValueEditable) return fields
  if (isDistribution.value) return { ...fields, probDistParams: parsedProbDist.value }
  if (fields.dataType === 'series') return { ...fields, value: parsedValues.value, std: parsedStd.value }
  return fields
}

/**
 * Applies the draft to the document.
 *
 * @param {Object} change - From buildRow.
 * @returns {Object|Array}
 */
const applyRow = (change) => (draft.value.index == null ? addDataItem(props.document, change) : updateDataItem(props.document, draft.value.index, change))

// What keeps the draft from being applied: what's missing or no number, then what CA would refuse of it.
const draftProblems = computed(() => {
  if (!draft.value) return []
  const problems = []
  const { name, operands, operation, operationKwargs, dataType, isValueEditable } = row.value
  if (!name.trim()) problems.push('Name the data item.')
  else if (items.value.some((item) => item.index !== draft.value.index && item.name === name)) problems.push(`A data item is already named ${name}.`)
  if (!operands.some(Boolean) && !(operation && Object.keys(operationKwargs).length)) problems.push('Choose a variable, or an operation whose arguments name other data items.')
  const invalid = Object.entries(draft.value.invalid).filter(([field, isInvalid]) => isInvalid && isFieldShown(field))
  if (invalid.length) problems.push(`Enter the ${invalid.map(([field]) => FIELD_NAMES[field]).join(', ')} as a number.`)
  if (isShown('value') && isValueEditable && !isDistribution.value && dataType === 'series' && (parsedValues.value === undefined || parsedStd.value === undefined)) problems.push('Enter the values and std as numbers.')
  if (isShown('value') && isValueEditable && isDistribution.value && parsedProbDist.value === undefined) problems.push('Enter the distribution as a JSON object.')
  const kwargs = listInvalidKwargs()
  if (kwargs.length) problems.push(`Enter ${kwargs.join(', ')} as a number.`)
  if (problems.length) return problems
  const index = draft.value.index ?? items.value.length
  const edited = applyRow(buildRow())
  const after = validateDataItems(edited, { vocabulary: props.vocabulary })
  const before = new Set(checked.value?.errors ?? [])
  return [...new Set([...(after.itemErrors[index] ?? []), ...after.sharedErrors].filter((message) => !before.has(message)).map(describeItemMessage))]
})

/**
 * Whether a number field is in the form.
 *
 * @param {string} field
 * @returns {boolean}
 */
function isFieldShown(field) {
  if (field === 'weight') return isShown('weight')
  if (!isShown('value') || !row.value.isValueEditable || isDistribution.value) return false
  return row.value.dataType === 'series' ? field === 'obsDt' : field === 'value' || field === 'std'
}

// The problems shown: none for a new item until it has a variable or a name, the button saying it is not ready.
const shownProblems = computed(() => (draft.value && (draft.value.index != null || draft.value.isNameTyped || row.value.operands.some(Boolean)) ? draftProblems.value : []))

/** Applies the draft, and closes the form. */
function applyDraft() {
  if (draftProblems.value.length) return
  emitDocument(applyRow(buildRow()))
  draft.value = null
}
</script>

<style scoped>
.data-items-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--p-content-border-color, #e2e8f0);
}

.data-items-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.data-items-heading {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--p-text-muted-color, #64748b);
}

.data-items-note,
.data-items-empty {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color, #64748b);
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.data-item-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.data-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px 8px;
  border: 1px solid var(--p-content-border-color, #e2e8f0);
  border-radius: 8px;
  font-size: 0.8125rem;
}

.data-item--compact {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  padding: 4px 8px;
}

.data-item--compact .column-spacer {
  display: none;
}

.data-item--open {
  border-color: color-mix(in srgb, var(--p-primary-color, #10b981) 60%, transparent);
}

.data-item-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.data-item-name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-item-chip {
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

.data-item-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  min-width: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color, #64748b);
}

.data-item-path {
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-item-experiment {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--p-text-color, #334155);
}

.data-item-swatch {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.data-item-comment {
  font-style: italic;
}

.data-item-form {
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

.form-field--wide {
  grid-column: 1 / -1;
}

.form-group {
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 0.8125rem;
}

.form-group legend {
  margin-bottom: 4px;
  padding: 0;
}

.form-note {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color, #64748b);
}

.form-note .pi {
  color: var(--p-orange-500, #f97316);
}

.operand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.operand-label {
  flex-shrink: 0;
  min-width: 2rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  color: var(--p-text-muted-color, #64748b);
}

.picked {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.add-operand-button,
.add-data-item-button {
  align-self: flex-start;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
</style>
