<template>
  <AutoComplete
    v-model="query"
    :suggestions="suggestions"
    option-label="name"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :virtual-scroller-options="{ itemSize: 46 }"
    scroll-height="18rem"
    complete-on-focus
    :delay="120"
    size="small"
    fluid
    class="variable-picker"
    @complete="(event) => search(event.query)"
    @option-select="(event) => pick(event.value)"
  >
    <template #option="{ option }">
      <div class="path-option">
        <span class="path-text">
          <span v-if="splitVariableName(option.name).component" class="path-component">{{ splitVariableName(option.name).component }}/</span><span class="path-name">{{ splitVariableName(option.name).name }}</span>
        </span>
        <span class="path-meta">
          <span v-if="option.unit" class="path-units">{{ option.unit }}</span>
          <span v-if="option.kind" class="path-kind">{{ KIND_LABELS[option.kind] ?? option.kind }}</span>
        </span>
        <!-- Always two lines, as the virtual scroller needs rows of one height. -->
        <span class="path-note">{{ describe(option) ?? (option.label && option.label !== option.name ? option.label : '\u00a0') }}</span>
      </div>
    </template>
    <template #empty>No variable matches.</template>
  </AutoComplete>
</template>

<script setup>
/**
 * One search box over every variable in the model, as `component/variable` names: every word typed must
 * appear in the name or label, in any order. Picking one emits it and clears the box for the next.
 */
import { nextTick, ref } from 'vue'

import AutoComplete from 'primevue/autocomplete'

import { searchVariables, splitVariableName } from './variableSearch.js'

const KIND_LABELS = { variable: 'variable', constant: 'parameter', global_constant: 'global', boundary_condition: 'boundary', inspection: 'inspection' }

const props = defineProps({
  // The host's variables: `{ name, label, unit, kind, value }`, as the editor's `variables` prop.
  variables: { type: Array, required: true },
  // Keeps a variable, such as only those a protocol can set.
  filter: { type: Function, default: () => true },
  // A note under a variable, or null for its label.
  describe: { type: Function, default: () => null },
  placeholder: { type: String, default: 'Search variables…' },
  ariaLabel: { type: String, default: 'Search variables' },
})
const emit = defineEmits(['pick'])

const query = ref('')
const suggestions = ref([])

/**
 * Lists the variables matching a query.
 *
 * @param {string} text
 */
function search(text) {
  suggestions.value = searchVariables(props.variables, text, { filter: props.filter })
}

/**
 * Emits a picked variable and clears the box.
 *
 * @param {Object} variable
 */
async function pick(variable) {
  emit('pick', variable)
  await nextTick()
  query.value = ''
}
</script>

<style scoped>
.path-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 8px;
  min-width: 0;
  font-size: 0.8125rem;
}

.path-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path-component {
  color: var(--p-text-muted-color, #64748b);
}

.path-name {
  font-weight: 600;
}

.path-meta {
  display: flex;
  gap: 6px;
  color: var(--p-text-muted-color, #64748b);
  font-size: 0.75rem;
}

.path-kind {
  padding: 0 4px;
  border-radius: 4px;
  background: var(--p-content-hover-background, #f1f5f9);
}

.path-note {
  grid-column: 1 / -1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--p-text-muted-color, #64748b);
  font-size: 0.75rem;
}
</style>
