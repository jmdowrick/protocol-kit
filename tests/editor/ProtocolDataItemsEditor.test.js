import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { flushPromises, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Select from 'primevue/select'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readObsDataOptions } from '../../src/core/dataItemVocabulary.js'
import { DATA_ITEM_COLUMN_PRESETS, ProtocolDataItemsEditor, ProtocolEditor, VariablePicker, resolveDataItemColumns } from '../../src/editor/index.js'

const RESOURCES = join(__dirname, '../resources')
const readFixture = (fileName) => JSON.parse(readFileSync(join(RESOURCES, fileName), 'utf8'))

const VARIABLES = [
  { name: 'membrane/V', label: 'Membrane voltage', unit: 'mV', kind: 'variable' },
  { name: 'i_Na/i_Na', unit: 'uA_per_cm2', kind: 'variable' },
]
const PEAK = { data_item_name: 'V_peak', data_type: 'constant', unit: 'mV', operands: ['membrane/V'], operation: 'max', value: 20, std: 1.5, experiment_idx: 1, subexperiment_idx: 0 }
const SERIES = { data_item_name: 'V_series', data_type: 'series', unit: 'mV', operands: ['membrane/V'], value: [1, 2, 3], std: 0.5, obs_dt: 0.1, experiment_idx: 0, subexperiment_idx: 1 }
const DOCUMENT = {
  protocol_info: { pre_times: [0, 0], sim_times: [[1, 2], [3]], params_to_change: {}, experiment_labels: ['Control', 'Drug'] },
  data_items: [PEAK, SERIES],
}

let wrapper
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

/**
 * Mounts the data items editor on a document, as the protocol editor does.
 *
 * @param {Object} obsData
 * @param {Object} [props]
 * @returns {import('@vue/test-utils').VueWrapper}
 */
function mountItems(obsData, props = {}) {
  wrapper = mount(ProtocolDataItemsEditor, {
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
 * Chooses an option of the form's Select, by its label.
 *
 * @param {string} label
 * @param {*} value
 */
async function choose(label, value) {
  wrapper
    .findAllComponents(Select)
    .find((select) => select.props('ariaLabel') === label)
    .vm.$emit('update:modelValue', value)
  await flushPromises()
}

/**
 * Types in a field of the form, by its label.
 *
 * @param {string} label
 * @param {string} text
 */
async function type(label, text) {
  await wrapper.find(`input[aria-label="${label}"]`).setValue(text)
  await flushPromises()
}

/**
 * Applies the form.
 */
async function submit() {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('resolveDataItemColumns', () => {
  it('reads a preset or a list of keys, in the editor order', () => {
    expect(resolveDataItemColumns('summary')).toEqual(['name', 'variable', 'experiment', 'subexperiment'])
    expect(resolveDataItemColumns('all')).toEqual(DATA_ITEM_COLUMN_PRESETS.all)
    expect(resolveDataItemColumns(['weight', 'name', 'nonsense'])).toEqual(['name', 'weight'])
    expect(resolveDataItemColumns('unknown')).toEqual(DATA_ITEM_COLUMN_PRESETS.all)
  })
})

describe('ProtocolDataItemsEditor, summary', () => {
  it('lists each item read-only: its name, variable, experiment and sub-experiment', () => {
    mountItems({ ...DOCUMENT, data_items: [...DOCUMENT.data_items, { ...PEAK, data_item_name: 'bad', std: 0 }] }, { columns: 'summary' })
    const items = wrapper.findAll('.data-item')
    expect(items).toHaveLength(3)
    expect(items[0].classes()).toContain('data-item--compact')
    expect(items[0].find('.data-item-name').text()).toBe('V_peak')
    const metaOf = (item) => item.findAll('.data-item-meta > span').map((span) => span.text())
    expect(metaOf(items[0])).toEqual(['membrane/V', 'Drug', 'sub-experiment 1'])
    expect(metaOf(items[1])).toEqual(['membrane/V', 'Control', 'sub-experiment 2'])
    expect(wrapper.find('.data-item-chip').exists()).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
    // Calibration's checks are not the host's to show.
    expect(wrapper.find('.p-message').exists()).toBe(false)
  })

  it('says when there are none', () => {
    mountItems({ protocol_info: DOCUMENT.protocol_info }, { columns: 'summary' })
    expect(wrapper.find('.data-items-empty').text()).toBe('No data items.')
  })

  it('edits only the columns shown, when the host makes it editable', async () => {
    mountItems(DOCUMENT, { columns: 'summary', readOnly: false })
    await wrapper.find('button[aria-label="Edit data item V_peak"]').trigger('click')
    expect(wrapper.find('input[aria-label="Standard deviation"]').exists()).toBe(false)
    expect(wrapper.find('input[aria-label="Data item name"]').exists()).toBe(true)
    await type('Data item name', 'V_max')
    await choose('Experiment', 0)
    await submit()
    expect(emittedDocuments()[0].data_items[0]).toEqual({ ...PEAK, data_item_name: 'V_max', experiment_idx: 0 })
  })
})

describe('ProtocolDataItemsEditor, all columns', () => {
  it('lists each item with what a calibration needs, and its errors inline', () => {
    mountItems({ ...DOCUMENT, data_items: [...DOCUMENT.data_items, { ...PEAK, data_item_name: 'bad', std: 0, weight: 2, cost_type: 'MSE', plot_type: 'None' }] })
    const items = wrapper.findAll('.data-item')
    expect(items[0].findAll('.data-item-chip').map((chip) => chip.text())).toEqual(['constant', 'max'])
    expect(items[0].find('.data-item-meta').text()).toContain('20 ± 1.5')
    expect(items[0].find('.data-item-meta').text()).toContain('cost gaussian_MLE (default)')
    expect(items[1].find('.data-item-meta').text()).toContain('3 values every 0.1')
    expect(items[2].find('.data-item-meta').text()).toContain('weight 2')
    expect(items[2].find('.data-item-meta').text()).toContain('no marker')
    expect(items[2].find('.p-message-error').text()).toBe("every 'std' entry must be finite and > 0, got 0.")
    expect(items[0].find('.p-message').exists()).toBe(false)
  })

  it('adds an item: a picked variable names it and gives its unit', async () => {
    mountItems(DOCUMENT)
    await wrapper.find('.add-data-item-button').trigger('click')
    expect(wrapper.find('form').attributes('aria-label')).toBe('Add a data item')
    wrapper.findComponent(VariablePicker).vm.$emit('pick', VARIABLES[1])
    await flushPromises()
    expect(wrapper.find('input[aria-label="Data item name"]').element.value).toBe('i_Na')
    await choose('Operation', 'min')
    await type('Value', '-400')
    await type('Standard deviation', '20')
    await choose('Sub-experiment', 1)
    await submit()
    expect(emittedDocuments()[0].data_items[2]).toEqual({
      data_item_name: 'i_Na',
      data_type: 'constant',
      operands: ['i_Na/i_Na'],
      unit: 'uA_per_cm2',
      operation: 'min',
      value: -400,
      std: 20,
      weight: 1,
      experiment_idx: 0,
      subexperiment_idx: 1,
      plot_type: 'horizontal',
    })
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it("edits an operation's kwargs and a cost's, dropping those the new func doesn't take", async () => {
    mountItems({ ...DOCUMENT, data_items: [{ ...PEAK, operation: 'max_in_range', operation_kwargs: { start_frac: 0.5 }, cost_type: 'MSE', cost_kwargs: { scale: 2 } }] })
    await wrapper.find('button[aria-label="Edit data item V_peak"]').trigger('click')
    expect(wrapper.find('input[aria-label="start_frac"]').element.value).toBe('0.5')
    expect(wrapper.find('input[aria-label="end_frac"]').attributes('placeholder')).toBe('1 by default')
    await type('end_frac', '0.9')
    await choose('Cost', 'gaussian_MLE_robust')
    expect(wrapper.find('input[aria-label="scale"]').exists()).toBe(false)
    await type('p_outlier', '0.1')
    await submit()
    const [item] = emittedDocuments()[0].data_items
    expect(item.operation_kwargs).toEqual({ start_frac: 0.5, end_frac: 0.9 })
    expect(item).toMatchObject({ cost_type: 'gaussian_MLE_robust', cost_kwargs: { p_outlier: 0.1 } })
  })

  it('refuses a kwarg that is no number, a repeated name, or what CA would refuse', async () => {
    mountItems({ ...DOCUMENT, data_items: [{ ...PEAK, operation: 'max_in_range' }, SERIES] })
    await wrapper.find('button[aria-label="Edit data item V_peak"]').trigger('click')
    await type('start_frac', 'half')
    expect(wrapper.find('.data-item-form').text()).toContain('Enter start_frac as a number.')
    await type('start_frac', '')
    await type('Data item name', 'V_series')
    expect(wrapper.find('.data-item-form').text()).toContain('A data item is already named V_series.')
    await type('Data item name', 'V_peak')
    await type('Standard deviation', '-1')
    expect(wrapper.find('.data-item-form').text()).toContain("every 'std' entry must be finite and > 0, got -1.")
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    await submit()
    expect(emittedDocuments()).toEqual([])
  })

  it("edits a series' values and std as lists", async () => {
    mountItems(DOCUMENT)
    await wrapper.find('button[aria-label="Edit data item V_series"]').trigger('click')
    expect(wrapper.find('input[aria-label="Values, separated by commas"]').element.value).toBe('1, 2, 3')
    await type('Values, separated by commas', '4, 5')
    await type('Standard deviation, one or one per value', '0.1 0.2')
    await submit()
    expect(emittedDocuments()[0].data_items[1]).toEqual({ ...SERIES, value: [4, 5], std: [0.1, 0.2] })
  })

  it('offers a reference to another item for an operation of no variables, which must be computed before it', async () => {
    mountItems({ ...DOCUMENT, data_items: [PEAK, { ...PEAK, data_item_name: 'V_min', operation: 'min' }] })
    await wrapper.find('.add-data-item-button').trigger('click')
    await choose('Operation', 'calculate_two_observable_difference')
    expect(wrapper.find('.data-item-form').text()).toContain('reads no variable')
    const select = wrapper.findAllComponents(Select).find((entry) => entry.props('ariaLabel') === 'subtract_from')
    expect(select.props('options').map(({ value }) => value)).toEqual(['', 'V_peak', 'V_min'])
    await choose('subtract_from', 'V_peak')
    await choose('subtract_this', 'V_min')
    await type('Data item name', 'difference')
    expect(wrapper.find('.data-item-form').text()).toContain("references data_item 'V_peak', which has not been computed yet")
    await choose('Experiment', 1)
    await submit()
    expect(emittedDocuments()[0].data_items[2]).toMatchObject({ data_item_name: 'difference', operands: [], operation_kwargs: { subtract_from: 'V_peak', subtract_this: 'V_min' }, experiment_idx: 1 })
  })

  it("offers the host's vocabulary", async () => {
    mountItems(DOCUMENT, { vocabulary: readObsDataOptions({ operations: ['max', 'my_op'], cost_types: ['MSE'], default_cost_type: 'MSE' }) })
    await wrapper.find('.add-data-item-button').trigger('click')
    const options = (label) => wrapper.findAllComponents(Select).find((entry) => entry.props('ariaLabel') === label).props('options').map(({ value }) => value)
    expect(options('Operation')).toEqual(['', 'max', 'my_op'])
    expect(options('Cost')).toEqual(['', 'MSE'])
  })

  it('removes an item once confirmed', async () => {
    const confirm = vi.fn(async () => true)
    mountItems(DOCUMENT, { confirm })
    await wrapper.find('button[aria-label="Remove data item V_peak"]').trigger('click')
    await flushPromises()
    expect(confirm.mock.calls[0][0]).toMatchObject({ header: 'Remove the data item V_peak?', acceptLabel: 'Remove' })
    expect(emittedDocuments()[0].data_items).toEqual([SERIES])
  })
})

describe('ProtocolEditor, data items', () => {
  /**
   * Mounts the protocol editor.
   *
   * @param {Object} obsData
   * @param {Object} [props]
   */
  function mountEditor(obsData, props = {}) {
    wrapper = mount(ProtocolEditor, {
      props: { document: obsData, variables: VARIABLES, confirm: vi.fn(async () => true), ...props },
      global: { plugins: [PrimeVue] },
      attachTo: globalThis.document.body,
    })
  }

  it('shows the data items with the columns the host chooses, or hides them', async () => {
    mountEditor(DOCUMENT, { dataItemColumns: 'summary' })
    const section = wrapper.findComponent(ProtocolDataItemsEditor)
    expect(section.props('columns')).toBe('summary')
    expect(section.find('.add-data-item-button').exists()).toBe(false)
    await wrapper.setProps({ showDataItems: false })
    expect(wrapper.findComponent(ProtocolDataItemsEditor).exists()).toBe(false)
  })

  it("shows a data-only document's items", () => {
    mountEditor([PEAK])
    expect(wrapper.findAll('.data-item')).toHaveLength(1)
  })

  it('shows the data items renumbered when a sub-experiment goes', async () => {
    const obsData = readFixture('prediction_items_536_obs_data.json')
    obsData.data_items[0].subexperiment_idx = 1
    mountEditor(obsData, { dataItemColumns: 'summary' })
    expect(wrapper.find('.data-item .data-item-meta').text()).toContain('sub-experiment 2')
    await wrapper.find('button[aria-label="Remove sub-experiment 1"]').trigger('click')
    await flushPromises()
    await wrapper.setProps({ document: emittedDocuments()[0] })
    expect(wrapper.find('.data-item .data-item-meta').text()).toContain('sub-experiment 1')
  })
})
