import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { flushPromises, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EXPERIMENT_PALETTE } from '../../src/core/experimentColours.js'
import { ProtocolEditor, VariablePicker } from '../../src/editor/index.js'

const RESOURCES = join(__dirname, '../resources')
const readFixture = (fileName) => JSON.parse(readFileSync(join(RESOURCES, fileName), 'utf8'))

// A host of its own: its model's variables, how it reads their values, and how it asks.
const VARIABLES = [
  { name: 'engine/pace', label: 'Pacing', unit: 'dimensionless', kind: 'constant', value: 0 },
  { name: 'membrane/V', unit: 'mV', kind: 'variable' },
  { name: 'membrane/V_clamp', unit: 'mV', kind: 'constant', value: -80 },
  { name: 'parameters/g_Na', unit: 'mS_per_cm2', kind: 'constant', value: 0.12 },
  { name: 'parameters/g_K', unit: 'mS_per_cm2', kind: 'constant', value: '0.036' },
  { name: 'global_parameters/T', unit: 'kelvin', kind: 'global_constant', value: 0 },
]

let wrapper
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  delete window.confirm
  document.body.innerHTML = ''
})

/**
 * Stands in for the browser's confirm, which happy-dom lacks.
 *
 * @param {boolean} answer
 * @returns {import('vitest').Mock}
 */
const stubBrowserConfirm = (answer) => (window.confirm = vi.fn(() => answer))

/**
 * Mounts the editor on a document, as a host would.
 *
 * @param {Object} document
 * @param {Object} [props]
 * @param {Array} [plugins] - Besides PrimeVue.
 * @returns {import('@vue/test-utils').VueWrapper}
 */
function mountEditor(document, props = {}, plugins = []) {
  wrapper = mount(ProtocolEditor, {
    props: { document, variables: VARIABLES, ...props },
    global: { plugins: [PrimeVue, ...plugins] },
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

describe('ProtocolEditor', () => {
  it('shows a br-1977 document: its experiment, its colour, and a lane for the parameter it paces', () => {
    mountEditor(readFixture('br-1977_obs_data.json'))
    const experiment = wrapper.find('.rail-item')
    expect(experiment.attributes('aria-label')).toBe('1 Hz pacing')
    expect(experiment.attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('.rail-meta').text()).toBe('2000 s in 1 part')
    // experiment_colors gives r, matplotlib's red.
    expect(wrapper.find('.swatch').attributes('style')).toBe('background: #e34948;')

    const lane = wrapper.find('.lane-label')
    expect(lane.attributes('title')).toBe('engine/pace')
    expect(lane.find('.lane-units').text()).toBe('dimensionless')
    expect(wrapper.find('.kind-chip').attributes('aria-label')).toBe('How engine/pace varies in sub-experiment 1: Pacing')
    expect(wrapper.find('.lane-plot polyline').attributes('stroke')).toBe('#e34948')
    expect(wrapper.findAll('[role="status"] .p-message')).toHaveLength(0)
  })

  it('offers to create a protocol when the document has none', async () => {
    mountEditor(null)
    await wrapper.find('.protocol-empty button').trigger('click')
    expect(emittedDocuments()[0].protocol_info.sim_times).toEqual([[1]])
  })

  it('edits a sub-experiment length in place and passes the document on', async () => {
    const original = readFixture('br-1977_obs_data.json')
    mountEditor(original)
    await wrapper.find('button[aria-label="Edit sub-experiment 1 length, 2000 s"]').trigger('click')
    const input = wrapper.find('input[aria-label="Sub-experiment 1 length"]')
    await input.setValue('1500')
    await input.trigger('keydown', { key: 'Enter' })

    const [edited] = emittedDocuments()
    expect(edited.protocol_info.sim_times).toEqual([[1500]])
    expect(edited.data_items).toEqual(original.data_items)
    // The editor never changes the document it is given.
    expect(original.protocol_info.sim_times).toEqual([[2000]])
  })

  it('renames an experiment', async () => {
    mountEditor(readFixture('br-1977_obs_data.json'))
    const name = wrapper.find('input[aria-label="Experiment name"]')
    await name.setValue('2 Hz pacing')
    await name.trigger('change')
    expect(emittedDocuments()[0].protocol_info.experiment_labels).toEqual(['2 Hz pacing'])
  })

  it("asks before removing a sub-experiment observations refer to, then renumbers the prediction items", async () => {
    const confirm = vi.fn(async () => true)
    mountEditor(readFixture('prediction_items_536_obs_data.json'), { confirm })
    await wrapper.find('button[aria-label="Remove sub-experiment 1"]').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledOnce()
    expect(confirm.mock.calls[0][0]).toMatchObject({ header: 'Remove sub-experiment 1?', severity: 'warning', acceptLabel: 'Remove', rejectLabel: 'Keep' })
    expect(confirm.mock.calls[0][0].message).toContain('2 observations refer to it (V_rest, i_Na_holding)')

    const [edited] = emittedDocuments()
    expect(edited.protocol_info.sim_times).toEqual([[200], [50, 200]])
    expect(edited.data_items).toEqual([])
    const items = edited.prediction_items.map(({ data_item_name, experiment_idx, subexperiment_idx }) => [data_item_name, experiment_idx, subexperiment_idx])
    expect(items).toEqual([
      // Recording over the experiment's last sub-experiment, which stays.
      ['V_trace', 0, undefined],
      ['I_peak_e0', 0, 0],
      ['I_peak_e1', 1, 1],
      ['V_step_e1', 1, 1],
      ['I_late_e1', 1, undefined],
    ])
  })

  it('keeps the sub-experiment when the host is told no', async () => {
    const confirm = vi.fn(async () => false)
    mountEditor(readFixture('prediction_items_536_obs_data.json'), { confirm })
    await wrapper.find('button[aria-label="Remove sub-experiment 1"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(emittedDocuments()).toEqual([])
  })

  it('asks with the browser when the host gives no confirm and has no ConfirmationService', async () => {
    const browserConfirm = stubBrowserConfirm(true)
    mountEditor(readFixture('br-1977_obs_data.json'))
    await wrapper.find('button[aria-label="Stop setting engine/pace"]').trigger('click')
    await flushPromises()
    expect(browserConfirm).toHaveBeenCalledWith('Stop setting engine/pace?\n\nThe protocol stops setting it in every experiment. Undo brings it back.')
    expect(emittedDocuments()[0].protocol_info.params_to_change).toEqual({})
  })

  it("asks with PrimeVue's ConfirmDialog when the host has its ConfirmationService", async () => {
    const browserConfirm = stubBrowserConfirm(true)
    mountEditor(readFixture('br-1977_obs_data.json'), {}, [ConfirmationService])
    await wrapper.find('button[aria-label="Stop setting engine/pace"]').trigger('click')
    await flushPromises()

    const dialog = document.body.querySelector('.p-confirmdialog')
    expect(dialog?.textContent).toContain('Stop setting engine/pace?')
    dialog.querySelector('.p-confirmdialog-accept-button').click()
    await flushPromises()
    expect(browserConfirm).not.toHaveBeenCalled()
    expect(emittedDocuments()[0].protocol_info.params_to_change).toEqual({})
  })

  it('adds a parameter picked from the host variables, at the value the host reads', async () => {
    const getValue = vi.fn((name) => (name === 'parameters/g_K' ? '0.072' : undefined))
    mountEditor(readFixture('br-1977_obs_data.json'), { getValue })
    await wrapper.find('.add-parameter-button').trigger('click')
    const picker = wrapper.findComponent(VariablePicker)

    // Only parameters, and not one the protocol sets already.
    const offered = VARIABLES.filter((variable) => picker.props('filter')(variable)).map((variable) => variable.name)
    expect(offered).toEqual(['membrane/V_clamp', 'parameters/g_Na', 'parameters/g_K', 'global_parameters/T'])

    picker.vm.$emit('pick', VARIABLES[4])
    await flushPromises()
    expect(getValue).toHaveBeenCalledWith('parameters/g_K')
    expect(emittedDocuments()[0].protocol_info.params_to_change['parameters/g_K']).toEqual([[0.072]])
    expect(wrapper.findComponent(VariablePicker).exists()).toBe(false)
  })

  it("adds a parameter at its value in the variables when the host gives no getValue", async () => {
    mountEditor(readFixture('br-1977_obs_data.json'))
    await wrapper.find('.add-parameter-button').trigger('click')
    wrapper.findComponent(VariablePicker).vm.$emit('pick', VARIABLES[4])
    await flushPromises()
    expect(emittedDocuments()[0].protocol_info.params_to_change['parameters/g_K']).toEqual([[0.036]])
  })

  it("colours experiments the file doesn't from the host's palette, else the default one", () => {
    const document = readFixture('prediction_items_536_obs_data.json')
    delete document.protocol_info.experiment_colors
    mountEditor(document, { palette: ['#123456', '#abcdef'] })
    expect(wrapper.findAll('.swatch').map((swatch) => swatch.attributes('style'))).toEqual(['background: #123456;', 'background: #abcdef;'])
    wrapper.unmount()

    mountEditor(document)
    expect(wrapper.find('.lane-plot polyline').attributes('stroke')).toBe(EXPERIMENT_PALETTE[0])
  })
})

describe('VariablePicker', () => {
  it('searches the variables given, keeping those the filter keeps, and emits the one picked', async () => {
    wrapper = mount(VariablePicker, {
      props: { variables: VARIABLES, filter: (variable) => variable.kind === 'constant' },
      global: { plugins: [PrimeVue] },
    })
    const autoComplete = wrapper.findComponent({ name: 'AutoComplete' })
    autoComplete.vm.$emit('complete', { query: 'g para' })
    await flushPromises()
    expect(autoComplete.props('suggestions').map((variable) => variable.name)).toEqual(['parameters/g_K', 'parameters/g_Na'])

    autoComplete.vm.$emit('option-select', { value: VARIABLES[3] })
    await flushPromises()
    expect(wrapper.emitted('pick')).toEqual([[VARIABLES[3]]])
  })
})
