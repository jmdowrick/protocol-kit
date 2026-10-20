<template>
  <label class="od-field">
    reduce
    <select :value="choice" :aria-label="`${axis} reduce`" @change="(event) => changeChoice(event.target.value)">
      <option v-for="option in REDUCE_CHOICES" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
  </label>
  <label v-if="choice === AT" class="od-field">
    at (s)
    <input type="number" min="0" step="any" :value="reference.reduce.at" :aria-label="`${axis} at`" @change="(event) => changeAt(event.target.value)" />
  </label>
</template>

<script setup>
/**
 * How an input reference (a feature_vs_input plot's x or series) turns a trace into one number: a dropdown of none,
 * each of INPUT_REDUCTIONS and "at a time", and for a time, its seconds from the start of the sub-experiment. Emits
 * `update:reduce` with the reference's new reduce, null for none.
 */
import { computed } from 'vue'

import { INPUT_REDUCTIONS } from '../core/predictionPlots.js'
import { isMapping } from '../core/protocolShapes.js'

// The values of the options for none and for a time.
const NONE = ''
const AT = 'at'
const REDUCE_CHOICES = [{ value: NONE, label: '(none)' }, ...INPUT_REDUCTIONS.map((value) => ({ value, label: value })), { value: AT, label: 'at a time' }]

const props = defineProps({
  // The input reference, as the plot has it.
  reference: { type: Object, default: null },
  // Which of the plot's keys it is, 'x' or 'series', naming the fields.
  axis: { type: String, required: true },
})
const emit = defineEmits(['update:reduce'])

const choice = computed(() => (props.reference?.reduce == null ? NONE : isMapping(props.reference.reduce) ? AT : props.reference.reduce))

/**
 * Chooses a reduce: none, one of INPUT_REDUCTIONS, or at a time, 0 s first.
 *
 * @param {string} value
 */
const changeChoice = (value) => emit('update:reduce', value === NONE ? null : value === AT ? { at: 0 } : value)

/**
 * Sets the time the input is read at, in seconds from the start of the sub-experiment.
 *
 * @param {string} text
 */
function changeAt(text) {
  if (text.trim() === '' || !Number.isFinite(Number(text))) return
  emit('update:reduce', { at: Number(text) })
}
</script>
