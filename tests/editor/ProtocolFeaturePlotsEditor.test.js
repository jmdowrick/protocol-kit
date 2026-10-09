import { flushPromises, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProtocolFeaturePlotsEditor, ProtocolOutputsEditor } from '../../src/editor/index.js'

const item = (name, group, experiment, fields = {}) => ({
  data_item_name: `${name}_e${experiment}`,
  operands: [name === 'I_peak' ? 'i_Na/i_Na' : 'clamp/V_cmd'],
  unit: name === 'I_peak' ? 'uA_per_cm2' : 'mV',
  operation: name === 'I_peak' ? 'min_in_range' : 'mean',
  experiment_idx: experiment,
  subexperiment_idx: 1,
  item_name_for_plotting: group,
  ...fields,
})
const DOCUMENT = {
  protocol_info: {
    pre_times: [0, 0],
    sim_times: [
      [50, 50],
      [50, 50],
    ],
    params_to_change: {
      'clamp/V_cmd': [
        [-80, -40],
        [-80, 'step_e1'],
      ],
      'i_Na/g_Na': [
        [0.12, 0.12],
        [0.12, 0.06],
      ],
    },
    protocol_shapes: { step_e1: { baseline: -80, events: [{ level: 0, start: 0, length: 50 }] } },
  },
  prediction_items: [item('I_peak', 'I_peak', 0), item('I_peak', 'I_peak', 1), item('V_step', 'V_step', 0), item('V_step', 'V_step', 1), { data_item_name: 'V', operands: ['m/V'], unit: 'mV' }],
  prediction_plots: [{ name: 'I-V', kind: 'feature_vs_feature', x: 'V_step', y: 'I_peak', series: null }],
}

let wrapper
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

/**
 * Mounts the feature plots editor on a document.
 *
 * @param {Object} obsData
 * @param {Object} [props]
 * @returns {import('@vue/test-utils').VueWrapper}
 */
function mountPlots(obsData, props = {}) {
  wrapper = mount(ProtocolFeaturePlotsEditor, {
    props: { document: obsData, confirm: vi.fn(async () => true), ...props },
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
 * Finds a Select by its aria-label.
 *
 * @param {string} label
 * @returns {import('@vue/test-utils').VueWrapper}
 */
const findSelect = (label) => wrapper.findAllComponents(Select).find((select) => select.attributes('aria-label') === label || select.props('ariaLabel') === label)

/**
 * Picks a value in a Select, as a user would.
 *
 * @param {string} label
 * @param {*} value
 */
async function pick(label, value) {
  findSelect(label).vm.$emit('update:modelValue', value)
  await flushPromises()
}

/**
 * Chooses how x is read.
 *
 * @param {string} kind
 */
async function chooseKind(kind) {
  wrapper.findComponent(SelectButton).vm.$emit('update:modelValue', kind)
  await flushPromises()
}

const shownMessages = () => wrapper.findAll('form .p-message').map((message) => message.text())

describe('ProtocolFeaturePlotsEditor', () => {
  it('lists the plots, with what each draws and its errors', () => {
    const plots = [...DOCUMENT.prediction_plots, { name: 'by input', kind: 'feature_vs_input', x: { params_to_change: 'clamp/V_cmd', subexperiment_idx: 1 }, y: 'I_peak', series: { params_to_change: 'i_Na/g_Na', subexperiment_idx: 1 } }]
    mountPlots({ ...DOCUMENT, prediction_plots: plots })
    const entries = wrapper.findAll('.plot')
    expect(entries.map((entry) => entry.find('.plot-name').text())).toEqual(['I-V', 'by input'])
    expect(entries[0].find('.plot-chip').text()).toBe('Against a feature')
    expect(entries[0].find('.plot-meta').text()).toBe('I_peak against V_step')
    expect(entries[0].find('.p-message').exists()).toBe(false)
    expect(entries[1].find('.plot-meta').text()).toContain('I_peak against clamp/V_cmd (sub-experiment 2)')
    expect(entries[1].find('.plot-meta').text()).toContain('a line per value of i_Na/g_Na (sub-experiment 2)')
    expect(entries[1].find('.p-message').text()).toBe("x reads 'clamp/V_cmd' in experiment_idx 1, sub-experiment 1, which is 'step_e1': a shape or trace, not a number.")
  })

  it('adds a plot of a feature against an input, titled until a title is typed', async () => {
    mountPlots({ ...DOCUMENT, prediction_plots: undefined })
    expect(wrapper.find('.plots-empty').text()).toBe('No feature plots yet.')
    await wrapper.find('.add-plot-button').trigger('click')
    // Only groups of features are offered.
    expect(findSelect('Feature to plot (y)').props('options').map(({ value }) => value)).toEqual(['I_peak', 'V_step'])
    expect(shownMessages()).toEqual([])
    expect(wrapper.find('form button[type="submit"]').attributes('disabled')).toBeDefined()
    await pick('Feature to plot (y)', 'I_peak')
    await chooseKind('feature_vs_input')
    expect(shownMessages()).toEqual(['Choose the input to plot it against.'])
    await pick('Input on x', 'i_Na/g_Na')
    expect(wrapper.find('input[aria-label="Feature plot title"]').element.value).toBe('I_peak vs i_Na/g_Na')
    expect(shownMessages()).toEqual([])
    await wrapper.find('form').trigger('submit')
    expect(emittedDocuments()[0].prediction_plots).toEqual([{ name: 'I_peak vs i_Na/g_Na', kind: 'feature_vs_input', x: { params_to_change: 'i_Na/g_Na', subexperiment_idx: 1 }, y: 'I_peak', series: null }])
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it("refuses what the plot's checks refuse, inline", async () => {
    mountPlots(DOCUMENT)
    await wrapper.find('.add-plot-button').trigger('click')
    await pick('Feature to plot (y)', 'I_peak')
    await chooseKind('feature_vs_input')
    await pick('Input on x', 'clamp/V_cmd')
    expect(shownMessages()).toEqual(["x reads 'clamp/V_cmd' in experiment_idx 1, sub-experiment 1, which is 'step_e1': a shape or trace, not a number."])
    await wrapper.find('input[aria-label="Feature plot title"]').setValue('I-V')
    expect(shownMessages()).toContain("Its name is prediction_plots[0]'s too; each plot needs its own.")
    expect(wrapper.find('form button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('edits a plot: by experiment, a line per value of an input, keeping its title', async () => {
    mountPlots(DOCUMENT)
    await wrapper.find('button[aria-label="Edit feature plot I-V"]').trigger('click')
    expect(wrapper.find('form').attributes('aria-label')).toBe('Edit feature plot I-V')
    expect(findSelect('Feature on x').props('modelValue')).toBe('V_step')
    await chooseKind('feature_vs_experiment')
    wrapper.findComponent(Checkbox).vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(shownMessages()).toEqual(['Choose the input whose values each draw a line.'])
    await pick('Input for the series', 'i_Na/g_Na')
    await pick('Sub-experiment of the input for the series', 0)
    await wrapper.find('form').trigger('submit')
    expect(emittedDocuments()[0].prediction_plots).toEqual([{ name: 'I-V', kind: 'feature_vs_experiment', x: null, y: 'I_peak', series: { params_to_change: 'i_Na/g_Na', subexperiment_idx: 0 } }])
  })

  it('asks before removing a plot', async () => {
    const confirm = vi.fn(async () => true)
    mountPlots(DOCUMENT, { confirm })
    await wrapper.find('button[aria-label="Remove feature plot I-V"]').trigger('click')
    await flushPromises()
    expect(confirm.mock.calls[0][0]).toMatchObject({ header: 'Remove the feature plot I-V?', message: 'It goes from the file; the features it plots stay.' })
    expect(Object.hasOwn(emittedDocuments()[0], 'prediction_plots')).toBe(false)
  })

  it("can't add a plot without features, and won't edit one it can't read", () => {
    mountPlots({ ...DOCUMENT, prediction_items: [DOCUMENT.prediction_items[4]], prediction_plots: [{ name: 'odd', kind: 'feature_vs_input', x: 'V_step', y: 'I_peak' }] })
    expect(wrapper.find('.add-plot-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button[aria-label="Edit feature plot odd"]').attributes('disabled')).toBeDefined()
  })
})

describe('ProtocolOutputsEditor', () => {
  it('shows the feature plots below the outputs, and passes their edits on', async () => {
    wrapper = mount(ProtocolOutputsEditor, {
      props: { document: DOCUMENT, variables: [], confirm: vi.fn(async () => true) },
      global: { plugins: [PrimeVue] },
      attachTo: globalThis.document.body,
    })
    const plots = wrapper.findComponent(ProtocolFeaturePlotsEditor)
    expect(plots.exists()).toBe(true)
    await plots.find('button[aria-label="Remove feature plot I-V"]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:document')[0][0].prediction_plots).toBeUndefined()
  })
})
