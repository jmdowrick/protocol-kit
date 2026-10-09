import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { flushPromises, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NumberInput, ProtocolEditor, ProtocolOutputsEditor, VariablePicker } from '../../src/editor/index.js'

const RESOURCES = join(__dirname, '../resources')
const readFixture = (fileName) => JSON.parse(readFileSync(join(RESOURCES, fileName), 'utf8'))

const VARIABLES = [
  { name: 'membrane/V', label: 'Membrane voltage', unit: 'mV', kind: 'variable' },
  { name: 'membrane/V_clamp', unit: 'mV', kind: 'constant', value: -80 },
  { name: 'i_Na/i_Na', unit: 'uA_per_cm2', kind: 'variable' },
]

let wrapper
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

/**
 * Mounts the outputs editor on a document, as the protocol editor does.
 *
 * @param {Object} obsData
 * @param {Object} [props]
 * @returns {import('@vue/test-utils').VueWrapper}
 */
function mountOutputs(obsData, props = {}) {
  wrapper = mount(ProtocolOutputsEditor, {
    props: { document: obsData, variables: VARIABLES, confirm: vi.fn(async () => true), ...props },
    global: { plugins: [PrimeVue] },
    attachTo: globalThis.document.body,
  })
  return wrapper
}

/**
 * The documents the editor has passed on.
 *
 * @returns {Array<Object>}
 */
const emittedDocuments = () => (wrapper.emitted('update:document') ?? []).map(([edited]) => edited)

/**
 * Opens the form and fills it in, as a user would.
 *
 * @param {Object} change
 * @param {Object} [change.variable]
 * @param {string} [change.kind]
 * @param {string} [change.operation]
 * @param {number[]} [change.range] - The start and end fractions.
 * @param {number|null} [change.sub]
 */
async function fillForm({ variable, kind, operation, range, sub }) {
  if (!wrapper.find('form').exists()) await wrapper.find('.add-output-button').trigger('click')
  if (variable) wrapper.findComponent(VariablePicker).vm.$emit('pick', variable)
  await flushPromises()
  if (kind) wrapper.findComponent(SelectButton).vm.$emit('update:modelValue', kind)
  await flushPromises()
  if (operation) wrapper.findComponent(Select).vm.$emit('update:modelValue', operation)
  await flushPromises()
  if (range) wrapper.findAllComponents(NumberInput).forEach((input, position) => input.vm.$emit('update:modelValue', range[position]))
  if (sub !== undefined) wrapper.findAllComponents(Select).at(-1).vm.$emit('update:modelValue', sub)
  await flushPromises()
}

describe('ProtocolOutputsEditor', () => {
  it('lists the outputs, validation data read-only, and warns what needs CA #536', () => {
    mountOutputs(readFixture('prediction_items_536_obs_data.json'))
    const outputs = wrapper.findAll('.output')
    expect(outputs.map((output) => output.find('.output-name').text())).toEqual(['V_trace', 'i_Na_holding', 'I_peak', 'V_step', 'I_late_e1'])
    const peak = outputs[2]
    expect(peak.find('.output-chip').text()).toBe('Minimum in a range')
    expect(peak.find('.output-meta').text()).toContain('over sub-experiment 2')
    expect(peak.find('.output-meta').text()).toContain('from 0 to 0.2 of it, the end not included')
    expect(peak.findAll('.output-experiment').map((experiment) => experiment.text())).toEqual(['V_step -20', 'V_step 0, half g_Na'])
    expect(outputs[0].find('.output-meta').text()).toContain('over the last sub-experiment')

    const data = outputs[4]
    expect(data.find('.output-chip--data').text()).toBe('Validation data')
    expect(data.find('button[aria-label="Edit output I_late_e1"]').exists()).toBe(false)
    expect(data.find('button[aria-label="Remove output I_late_e1"]').exists()).toBe(false)
    expect(wrapper.find('.messages').text()).toContain('needs circulatory_autogen with #536; released libcuflynx 0.7.3 and current CUFLynx reject this file')
  })

  it('adds a feature over a sub-experiment of every experiment, one item each', async () => {
    mountOutputs(readFixture('br-1977_obs_data.json'))
    expect(wrapper.find('.outputs-empty').exists()).toBe(true)
    await fillForm({ variable: VARIABLES[0], kind: 'feature', operation: 'max_in_range', range: [0.5, 1] })
    // Named after the variable until a name is typed.
    expect(wrapper.find('input[aria-label="Output name"]').element.value).toBe('V')
    await wrapper.find('form').trigger('submit')

    expect(emittedDocuments()[0].prediction_items).toEqual([
      {
        data_item_name: 'V',
        operands: ['membrane/V'],
        unit: 'mV',
        operation: 'max_in_range',
        operation_kwargs: { start_frac: 0.5, end_frac: 1 },
        experiment_idx: 0,
        item_name_for_plotting: 'V',
        trace_name_for_plotting: 'Membrane voltage',
      },
    ])
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('names an output apart from the others', async () => {
    mountOutputs(readFixture('prediction_items_536_obs_data.json'))
    await fillForm({ variable: VARIABLES[2] })
    await wrapper.find('input[aria-label="Output name"]').setValue('I_peak')
    expect(wrapper.findAll('form .p-message').map((message) => message.text())).toEqual(['An output is already named I_peak.'])
    // As validation data has it is fine: that is what it validates.
    await wrapper.find('input[aria-label="Output name"]').setValue('I_late_e1')
    expect(wrapper.findAll('form .p-message')).toHaveLength(0)
  })

  it('offers parameters only for a mean', async () => {
    mountOutputs(readFixture('br-1977_obs_data.json'))
    await fillForm({})
    const offered = () => VARIABLES.filter((variable) => wrapper.findComponent(VariablePicker).props('filter')(variable)).map(({ name }) => name)
    expect(offered()).toEqual(['membrane/V', 'i_Na/i_Na'])
    await fillForm({ kind: 'feature', operation: 'mean' })
    expect(offered()).toEqual(['membrane/V', 'membrane/V_clamp', 'i_Na/i_Na'])
    await fillForm({ variable: VARIABLES[1], operation: 'max' })
    expect(wrapper.findAll('form .p-message').map((message) => message.text())).toEqual(['membrane/V_clamp is a parameter: only its mean can be recorded.'])
  })

  it('refuses a range that takes no samples, at the dt given', async () => {
    mountOutputs(readFixture('br-1977_obs_data.json'), { dt: 1 })
    await fillForm({ variable: VARIABLES[0], kind: 'feature', operation: 'min_in_range', range: [0, 0.0001] })
    const [message] = wrapper.findAll('form .p-message').map((found) => found.text())
    expect(message).toMatch(/^prediction_items\[0\] \('V'\): The range 0 to 0.0001 of 2000 s takes no samples: at 1 s apart it records 2001/)
    expect(wrapper.find('form button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('records over a sub-experiment, numbered from 1, only in experiments that have it', async () => {
    const obsData = readFixture('prediction_items_536_obs_data.json')
    obsData.protocol_info.sim_times[1] = [250]
    obsData.protocol_info.params_to_change = {}
    obsData.prediction_items = []
    mountOutputs(obsData)
    await fillForm({ variable: VARIABLES[2], sub: 1 })
    expect(wrapper.findAllComponents(Select).at(-1).props('options').map(({ label }) => label)).toEqual(['The last of each experiment', 'Sub-experiment 1', 'Sub-experiment 2'])
    expect(wrapper.findAll('.form-experiment').map((experiment) => experiment.classes('form-experiment--none'))).toEqual([false, true])
    await wrapper.find('form').trigger('submit')
    expect(emittedDocuments()[0].prediction_items.map((item) => [item.data_item_name, item.experiment_idx, item.subexperiment_idx])).toEqual([['i_Na', 0, 1]])
  })

  it('edits an output, its items keeping their names', async () => {
    mountOutputs(readFixture('prediction_items_536_obs_data.json'))
    await wrapper.find('button[aria-label="Edit output I_peak"]').trigger('click')
    expect(wrapper.find('input[aria-label="Output name"]').element.value).toBe('I_peak')
    await fillForm({ operation: 'max_in_range', range: [0.1, 0.4] })
    await wrapper.find('form').trigger('submit')
    const items = emittedDocuments()[0].prediction_items
    expect(items.slice(2, 4)).toEqual([
      { data_item_name: 'I_peak_e0', operands: ['i_Na/i_Na'], unit: 'uA_per_cm2', operation: 'max_in_range', operation_kwargs: { start_frac: 0.1, end_frac: 0.4 }, experiment_idx: 0, subexperiment_idx: 1, item_name_for_plotting: 'I_peak' },
      { data_item_name: 'I_peak_e1', operands: ['i_Na/i_Na'], unit: 'uA_per_cm2', operation: 'max_in_range', operation_kwargs: { start_frac: 0.1, end_frac: 0.4 }, experiment_idx: 1, subexperiment_idx: 1, item_name_for_plotting: 'I_peak' },
    ])
    // The validation item is as it was.
    expect(items[5]).toEqual(readFixture('prediction_items_536_obs_data.json').prediction_items[5])
  })

  it('asks before removing an output', async () => {
    const confirm = vi.fn(async () => true)
    mountOutputs(readFixture('prediction_items_536_obs_data.json'), { confirm })
    await wrapper.find('button[aria-label="Remove output I_peak"]').trigger('click')
    await flushPromises()
    expect(confirm.mock.calls[0][0]).toMatchObject({ header: 'Remove the output I_peak?', message: 'Its 2 prediction items go from the file (I_peak_e0, I_peak_e1).' })
    expect(emittedDocuments()[0].prediction_items.map((item) => item.data_item_name)).toEqual(['V_trace', 'i_Na_holding', 'V_step_e1', 'I_late_e1'])
  })
})

describe('ProtocolEditor', () => {
  it('shows the outputs below the protocol, and passes their edits on', async () => {
    const confirm = vi.fn(async () => true)
    wrapper = mount(ProtocolEditor, {
      props: { document: readFixture('prediction_items_536_obs_data.json'), variables: VARIABLES, confirm, dt: 0.01 },
      global: { plugins: [PrimeVue] },
      attachTo: globalThis.document.body,
    })
    const outputs = wrapper.findComponent(ProtocolOutputsEditor)
    expect(outputs.props('dt')).toBe(0.01)
    await outputs.find('button[aria-label="Remove output V_trace"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(wrapper.emitted('update:document')[0][0].prediction_items).toHaveLength(5)
  })
})
