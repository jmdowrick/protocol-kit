import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { afterEach, describe, expect, it } from 'vitest'

import { PredictionPlotsSection } from '../../src/editor/index.js'

const peak = (experiment) => ({
  data_item_name: `I_peak_e${experiment}`,
  operands: ['i_Na/i_Na'],
  unit: 'uA_per_cm2',
  operation: 'min_in_range',
  operation_kwargs: { start_frac: 0, end_frac: 0.2 },
  experiment_idx: experiment,
  subexperiment_idx: 1,
  item_name_for_plotting: 'I_peak',
})
const step = (experiment) => ({ data_item_name: `V_step_e${experiment}`, operands: ['clamp/V_cmd'], unit: 'mV', operation: 'mean', experiment_idx: experiment, subexperiment_idx: 1, item_name_for_plotting: 'V_step' })
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
        [-80, 0],
      ],
    },
  },
  data_items: [],
  prediction_items: [peak(0), peak(1), step(0), step(1), { data_item_name: 'V', operands: ['membrane/V'], unit: 'mV' }],
  prediction_plots: [{ name: 'I-V', kind: 'feature_vs_input', x: { params_to_change: 'clamp/V_cmd', subexperiment_idx: 1 }, y: 'I_peak', series: null }],
}

let wrapper
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

/**
 * Mounts the section on a document.
 *
 * @param {Object} obsData
 * @param {Object} [props]
 * @returns {import('@vue/test-utils').VueWrapper}
 */
function mountSection(obsData, props = {}) {
  wrapper = mount(PredictionPlotsSection, { props: { document: obsData, ...props }, global: { plugins: [PrimeVue] }, attachTo: globalThis.document.body })
  return wrapper
}

const lastDocument = () => wrapper.emitted('update:document').at(-1)[0]
const rows = () => wrapper.findAll('[data-testid="od-plot-row"]')

/**
 * Changes a native field of a row, by its label.
 *
 * @param {import('@vue/test-utils').DOMWrapper} row
 * @param {string} label
 * @param {string} value
 */
async function change(row, label, value) {
  const field = row.find(`[aria-label="${label}"]`)
  await field.setValue(value)
  await field.trigger('change')
}

describe('PredictionPlotsSection', () => {
  it('lists a row per plot: name, kind and its settings, over the feature groups and inputs', () => {
    mountSection(DOCUMENT)
    expect(wrapper.find('h3').text()).toBe('prediction_plots')
    expect(wrapper.findAll('.od-head span').map((head) => head.text())).toEqual(['name', 'kind', 'settings', ''])
    const [plot] = rows()
    expect(plot.find('[aria-label="name"]').element.value).toBe('I-V')
    expect(plot.find('[aria-label="kind"]').element.value).toBe('feature_vs_input')
    // Only the groups of features: V, a trace, isn't one.
    expect(plot.findAll('[aria-label="y"] option').map((option) => option.text())).toEqual(['I_peak', 'V_step'])
    expect(plot.findAll('[aria-label="x input"] option').map((option) => option.text())).toEqual(['clamp/V_cmd'])
    expect(plot.find('[aria-label="x sub-experiment"]').element.value).toBe('1')
    expect(plot.findAll('[aria-label="x sub-experiment"] option').map((option) => option.text())).toEqual(['0', '1'])
    expect(plot.find('[aria-label="series"]').element.value).toBe('')
    expect(plot.classes()).not.toContain('od-invalid')
  })

  it('edits a plot: against another group, a line per value of an input', async () => {
    mountSection(DOCUMENT)
    await change(rows()[0], 'kind', 'feature_vs_feature')
    expect(lastDocument().prediction_plots[0]).toEqual({ name: 'I-V', kind: 'feature_vs_feature', x: 'V_step', y: 'I_peak', series: null })
    await change(rows()[0], 'series', JSON.stringify(['clamp/V_cmd', 0]))
    expect(lastDocument().prediction_plots[0].series).toEqual({ params_to_change: 'clamp/V_cmd', subexperiment_idx: 0 })
  })

  it('tints a plot the checks refuse, and says why', () => {
    mountSection({ ...DOCUMENT, prediction_plots: [{ ...DOCUMENT.prediction_plots[0], y: 'membrane/V' }] })
    expect(rows()[0].classes()).toContain('od-invalid')
    expect(rows()[0].find('.od-error').text()).toBe("y names 'membrane/V', which has items that aren't features: each needs an operation that gives one number, and no data_type 'series'.")
  })

  it('adds a plot of the first group against the first input, and removes one', async () => {
    mountSection(DOCUMENT)
    await wrapper.findAll('button').find((button) => button.text() === 'Add prediction plot').trigger('click')
    expect(lastDocument().prediction_plots[1]).toEqual({ name: 'I_peak vs clamp/V_cmd', kind: 'feature_vs_input', x: { params_to_change: 'clamp/V_cmd', subexperiment_idx: 0 }, y: 'I_peak', series: null })
    await rows()[0].find('[aria-label="remove"]').trigger('click')
    expect(lastDocument()).not.toHaveProperty('prediction_plots')
  })

  it('lists them read-only, and says there are none', () => {
    mountSection(DOCUMENT, { readOnly: true })
    expect(rows()[0].findAll('.od-cell').map((cell) => cell.text())).toEqual(['I-V', 'feature_vs_input', 'y I_peak, x clamp/V_cmd [sub 1], series (none)'])
    wrapper.unmount()
    const { prediction_plots: _, ...withoutPlots } = DOCUMENT
    mountSection(withoutPlots)
    expect(wrapper.find('.od-empty').text()).toBe('No prediction_plots. Add one below.')
  })

  it('chooses the kind from a dropdown of the four CA draws', () => {
    mountSection(DOCUMENT)
    const kind = rows()[0].find('[aria-label="kind"]')
    expect(kind.element.tagName).toBe('SELECT')
    expect(kind.findAll('option').map((option) => option.element.value)).toEqual(['feature_vs_feature', 'feature_vs_input', 'input_and_output', 'output_vs_input'])
  })

  it("shows the chosen kind's settings alone", async () => {
    const labels = () =>
      rows()[0]
        .find('[data-testid="od-plot-settings"]')
        .findAll('[aria-label]')
        .map((field) => field.attributes('aria-label'))
    const remount = async (kind) => {
      wrapper?.unmount()
      mountSection(DOCUMENT)
      await change(rows()[0], 'kind', kind)
      wrapper.setProps({ document: lastDocument() })
      await wrapper.vm.$nextTick()
    }
    mountSection(DOCUMENT)
    expect(labels()).toEqual(['y', 'x input', 'x sub-experiment', 'x reduce', 'series'])
    await remount('feature_vs_feature')
    expect(labels()).toEqual(['y', 'x', 'series'])
    await remount('input_and_output')
    expect(labels()).toEqual(['input', 'output', 'experiments', 'Experiment 1', 'Experiment 2'])
    await remount('output_vs_input')
    expect(labels()).toEqual(['input', 'output', 'experiments', 'Experiment 1', 'Experiment 2'])
  })

  it("switches kind without leaving the old kind's keys, keeping the name and carrying the input over", async () => {
    mountSection(DOCUMENT)
    await change(rows()[0], 'kind', 'input_and_output')
    expect(lastDocument().prediction_plots[0]).toEqual({ name: 'I-V', kind: 'input_and_output', input: { params_to_change: 'clamp/V_cmd' }, output: '' })
    await wrapper.setProps({ document: lastDocument() })
    await change(rows()[0], 'output', 'membrane/V')
    await wrapper.setProps({ document: lastDocument() })
    await change(rows()[0], 'kind', 'output_vs_input')
    expect(lastDocument().prediction_plots[0]).toEqual({ name: 'I-V', kind: 'output_vs_input', input: { params_to_change: 'clamp/V_cmd' }, output: 'membrane/V' })
    await wrapper.setProps({ document: lastDocument() })
    await change(rows()[0], 'kind', 'feature_vs_input')
    expect(lastDocument().prediction_plots[0]).toEqual({ name: 'I-V', kind: 'feature_vs_input', x: { params_to_change: 'clamp/V_cmd', subexperiment_idx: 0 }, y: 'I_peak', series: null })
  })

  it("edits feature_vs_input's x: its input, sub-experiment, and a reduce, at a time too", async () => {
    mountSection(DOCUMENT)
    const at = () => rows()[0].find('[aria-label="x at"]')
    expect(at().exists()).toBe(false)
    expect(rows()[0].findAll('[aria-label="x reduce"] option').map((option) => option.element.value)).toEqual(['', 'final', 'mean', 'max', 'min', 'at'])
    await change(rows()[0], 'x sub-experiment', '0')
    expect(lastDocument().prediction_plots[0].x).toEqual({ params_to_change: 'clamp/V_cmd', subexperiment_idx: 0 })
    await change(rows()[0], 'x reduce', 'mean')
    expect(lastDocument().prediction_plots[0].x).toEqual({ params_to_change: 'clamp/V_cmd', subexperiment_idx: 1, reduce: 'mean' })
    await wrapper.setProps({ document: lastDocument() })
    await change(rows()[0], 'x reduce', 'at')
    expect(lastDocument().prediction_plots[0].x).toEqual({ params_to_change: 'clamp/V_cmd', subexperiment_idx: 1, reduce: { at: 0 } })
    await wrapper.setProps({ document: lastDocument() })
    expect(at().element.value).toBe('0')
    await change(rows()[0], 'x at', '12.5')
    expect(lastDocument().prediction_plots[0].x).toEqual({ params_to_change: 'clamp/V_cmd', subexperiment_idx: 1, reduce: { at: 12.5 } })
    await wrapper.setProps({ document: lastDocument() })
    // Changing the sub-experiment keeps the reduce; none drops it.
    await change(rows()[0], 'x sub-experiment', '0')
    expect(lastDocument().prediction_plots[0].x).toEqual({ params_to_change: 'clamp/V_cmd', subexperiment_idx: 0, reduce: { at: 12.5 } })
    await change(rows()[0], 'x reduce', '')
    expect(lastDocument().prediction_plots[0].x).toEqual({ params_to_change: 'clamp/V_cmd', subexperiment_idx: 1 })
  })

  it("edits a series' reduce as x's, keeping it as the series' input or sub-experiment changes", async () => {
    const series = { params_to_change: 'clamp/V_cmd', subexperiment_idx: 1, reduce: 'max' }
    mountSection({ ...DOCUMENT, prediction_plots: [{ ...DOCUMENT.prediction_plots[0], series }] })
    const field = (label) => rows()[0].find(`[aria-label="${label}"]`)
    expect(field('series reduce').element.value).toBe('max')
    expect(rows()[0].findAll('[aria-label="series reduce"] option').map((option) => option.element.value)).toEqual(['', 'final', 'mean', 'max', 'min', 'at'])
    expect(field('series at').exists()).toBe(false)
    // Another series keeps the reduce read from the file.
    await change(rows()[0], 'series', JSON.stringify(['clamp/V_cmd', 0]))
    expect(lastDocument().prediction_plots[0].series).toEqual({ ...series, subexperiment_idx: 0 })
    await change(rows()[0], 'series reduce', 'at')
    expect(lastDocument().prediction_plots[0].series).toEqual({ ...series, reduce: { at: 0 } })
    await wrapper.setProps({ document: lastDocument() })
    expect(field('series at').element.value).toBe('0')
    await change(rows()[0], 'series at', '7.5')
    expect(lastDocument().prediction_plots[0].series).toEqual({ ...series, reduce: { at: 7.5 } })
    await change(rows()[0], 'series reduce', '')
    expect(lastDocument().prediction_plots[0].series).toEqual({ params_to_change: 'clamp/V_cmd', subexperiment_idx: 1 })
    // x is untouched by the series' reduce.
    expect(lastDocument().prediction_plots[0].x).toEqual(DOCUMENT.prediction_plots[0].x)
    // No series, no reduce for it.
    await change(rows()[0], 'series', '')
    expect(lastDocument().prediction_plots[0].series).toBe(null)
    await wrapper.setProps({ document: lastDocument() })
    expect(field('series reduce').exists()).toBe(false)
  })

  it("edits input_and_output's input, output and experiments, all of them leaving experiments out", async () => {
    const plot = { name: 'V', kind: 'input_and_output', input: { params_to_change: 'clamp/V_cmd' }, output: 'membrane/V' }
    mountSection({ ...DOCUMENT, prediction_plots: [plot] })
    const box = (label) => rows()[0].find(`input[aria-label="${label}"]`)
    expect([box('Experiment 1').element.checked, box('Experiment 2').element.checked]).toEqual([true, true])
    await box('Experiment 2').setValue(false)
    expect(lastDocument().prediction_plots[0]).toEqual({ ...plot, experiments: [0] })
    await wrapper.setProps({ document: lastDocument() })
    // The last experiment drawn can't be unticked.
    expect(box('Experiment 1').element.disabled).toBe(true)
    await box('Experiment 2').setValue(true)
    expect(lastDocument().prediction_plots[0]).toEqual(plot)
    await change(rows()[0], 'output', 'membrane/I')
    expect(lastDocument().prediction_plots[0].output).toBe('membrane/I')
    expect(rows()[0].classes()).not.toContain('od-invalid')
  })

  it("picks the output from the host's variables when it gives them", async () => {
    const plot = { name: 'V', kind: 'output_vs_input', input: { params_to_change: 'clamp/V_cmd' }, output: 'membrane/V' }
    mountSection({ ...DOCUMENT, prediction_plots: [plot] }, { variables: [{ name: 'membrane/V', unit: 'mV' }, { name: 'i_Na/i_Na', unit: 'uA_per_cm2' }] })
    const output = rows()[0].find('button[aria-label="output"]')
    expect(output.text()).toBe('membrane/V')
    await output.trigger('click')
    expect(rows()[0].find('.variable-cell input').exists()).toBe(true)
  })

  it('warns that CA leaves out the points of an input read as a trace with no reduce', () => {
    const info = structuredClone(DOCUMENT.protocol_info)
    info.params_to_change['clamp/V_cmd'][1][1] = 'step'
    info.protocol_traces = { step: { t: [0, 50], values: [0, 0] } }
    mountSection({ ...DOCUMENT, protocol_info: info })
    expect(rows()[0].classes()).not.toContain('od-invalid')
    expect(rows()[0].find('.od-warn').text()).toBe("x reads 'clamp/V_cmd' as a trace in experiment_idx [1], and has no reduce to make it one number: CA leaves out those points.")
  })
})
