import { flushPromises, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { afterEach, describe, expect, it } from 'vitest'

import { InlineNumber, NumberInput, ProtocolCellEditor } from '../../src/editor/index.js'

let wrapper
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

/**
 * Mounts a component with PrimeVue.
 *
 * @param {Object} component
 * @param {Object} props
 * @returns {import('@vue/test-utils').VueWrapper}
 */
const mountWith = (component, props) => (wrapper = mount(component, { props, global: { plugins: [PrimeVue] }, attachTo: document.body }))

describe('NumberInput', () => {
  it('passes on any number as typed, and marks what is not one', async () => {
    mountWith(NumberInput, { modelValue: 1, suffix: ' mV', ariaLabel: 'Value' })
    const input = wrapper.find('input')
    expect(input.element.value).toBe('1')
    expect(wrapper.find('.number-suffix').text()).toBe('mV')

    await input.setValue('2.5E-9')
    expect(wrapper.emitted('update:modelValue')).toEqual([[2.5e-9]])
    await input.setValue('2.5E-')
    expect(wrapper.classes()).toContain('number-input--invalid')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })
})

describe('InlineNumber', () => {
  it('keeps a value on Enter, and leaves it on Escape', async () => {
    mountWith(InlineNumber, { modelValue: 2, ariaLabel: 'Warm-up', suffix: ' s' })
    expect(wrapper.find('button').attributes('aria-label')).toBe('Edit warm-up, 2 s')

    await wrapper.find('button').trigger('click')
    await wrapper.find('input').setValue('3')
    await wrapper.find('input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.find('button').trigger('click')
    await wrapper.find('input').setValue('3')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toEqual([[3]])
  })

  it('refuses a value at a minimum it excludes', async () => {
    mountWith(InlineNumber, { modelValue: 2, ariaLabel: 'Length', min: 0, isMinExcluded: true })
    await wrapper.find('button').trigger('click')
    await wrapper.find('input').setValue('0')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})

describe('ProtocolCellEditor', () => {
  const props = { parameter: 'membrane/V_clamp', sub: 1, cell: { kind: 'constant', value: -80 }, duration: 200, units: 'mV' }

  it('applies a number', async () => {
    mountWith(ProtocolCellEditor, props)
    await wrapper.find('input[aria-label="Value"]').setValue('-60')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('apply')).toEqual([[{ value: -60 }]])
  })

  it('turns a number into a step from it, and applies the shape', async () => {
    mountWith(ProtocolCellEditor, { ...props, initialKind: 'step' })
    await flushPromises()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('apply')).toEqual([[{ shape: { baseline: -80, events: [{ level: -160, start: 50, length: 150 }] } }]])
  })

  it("says why circulatory autogen would refuse a step after the sub-experiment's end", async () => {
    mountWith(ProtocolCellEditor, { ...props, initialKind: 'step' })
    await wrapper.find('input[aria-label="Step time"]').setValue('250')
    expect(wrapper.find('.p-message').text()).toBe("The step comes at or after the sub-experiment's end, at 200 s.")
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })
})
