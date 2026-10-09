import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findParametersAtModelValues, readProtocolInfo, readShapeForm } from '../../src/core/protocolModel.js'
import { normaliseShape } from '../../src/core/protocolShapes.js'
import { validateProtocolInfo } from '../../src/core/protocolValidation.js'

const RESOURCES = join(__dirname, '../resources')

/**
 * Reads a fixture's protocol as PhLynx runs it.
 *
 * @param {string} fileName
 * @returns {Object}
 */
function readFixture(fileName) {
  const { errors, protocolInfo } = validateProtocolInfo(JSON.parse(readFileSync(join(RESOURCES, fileName), 'utf8')).protocol_info)
  expect(errors).toEqual([])
  return readProtocolInfo(protocolInfo)
}

describe('readProtocolInfo', () => {
  it('reads experiments of sub-experiments, timed from the end of the warm-up', () => {
    const { experiments, controls } = readFixture('SN_simple_obs_data.json')
    expect(experiments.map(({ label, colour, preTime, duration }) => ({ label, colour, preTime, duration }))).toEqual([
      { label: 'SHR', colour: 'r', preTime: 1, duration: 3 },
      { label: 'SHR M-activation', colour: 'b', preTime: 1, duration: 3 },
      { label: 'I_ramp', colour: 'g', preTime: 1, duration: 2 },
    ])
    expect(experiments[0].subs).toEqual([
      { start: 0, duration: 1 },
      { start: 1, duration: 2 },
    ])
    expect(controls.map(({ parameter }) => parameter)).toEqual(['soma_SN/I_in', 'soma_SN/g_M'])
    expect(controls[0].cells[0]).toEqual([
      { kind: 'constant', value: 0 },
      { kind: 'constant', value: -0.15 },
    ])
    expect(controls[0].cells[2][1]).toMatchObject({ kind: 'trace', name: 'ramp_port', trace: { t: expect.any(Array) } })
  })

  it('reads a shape as the form it was written in', () => {
    const { controls } = readFixture('br-1977_obs_data.json')
    expect(controls[0].cells[0][0]).toMatchObject({
      kind: 'shape',
      name: 'engine_pace',
      form: { type: 'pacing', baseline: 0, level: 1, start: 100, length: 2, period: 1000, multiplier: 0 },
    })
  })

  it('leaves labels and colours out where the file gives none', () => {
    const { experiments } = readFixture('NKE_pump_obs_data.json')
    expect(experiments).toMatchObject([{ label: 'exp_0', colour: null, id: null, preTime: 1, duration: 280 }])
  })
})

describe('a shape CA would refuse', () => {
  it('stays in its own cell, with why, while the others read and draw as they are', () => {
    const { controls } = readProtocolInfo({
      pre_times: [0],
      sim_times: [[1, 1]],
      params_to_change: { 'a/k': [['bad', 'up']] },
      protocol_shapes: { bad: { events: [{ level: 1, start: 5, length: 1 }] }, up: { type: 'ramp', from: 0, to: 2 } },
      protocol_traces: {},
    })
    const [bad, up] = controls[0].cells[0]
    expect(bad).toMatchObject({ kind: 'shape', name: 'bad', shape: null, form: null, trace: null })
    expect(bad.error).toMatch(/fires nothing/)
    expect(up).toMatchObject({ kind: 'shape', form: { type: 'ramp', from: 0, to: 2 }, trace: { t: [0, 1], values: [0, 2] } })
  })
})

describe('readShapeForm', () => {
  const form = (shape, duration) => readShapeForm(normaliseShape(shape, 's'), duration)

  it('tells steps, pulses, pacing and ramps apart, as CUFLynx offers them', () => {
    expect(form({ baseline: 1, events: [{ level: 2, start: 3, length: 7 }] }, 10)).toEqual({ type: 'step', baseline: 1, level: 2, start: 3 })
    expect(form({ events: [{ level: 2, start: 3, length: 2 }] }, 10)).toEqual({ type: 'pulse', baseline: 0, level: 2, start: 3, end: 5 })
    expect(form({ type: 'ramp', from: 1, to: 2 }, 10)).toEqual({ type: 'ramp', from: 1, to: 2 })
    expect(form({ events: [{ level: 1, length: 1 }, { level: 2, start: 5, length: 1 }] }, 10)).toBeNull()
  })
})

describe('findParametersAtModelValues', () => {
  // Two experiments, the second of two sub-experiments.
  const view = (params, extra = {}) =>
    readProtocolInfo({ pre_times: [0, 0], sim_times: [[1], [1, 1]], params_to_change: params, protocol_shapes: {}, protocol_traces: {}, ...extra })
  const model = { 'a/g': 0.12, 'a/zero': 0, 'a/text': '-80', 'a/unknown': null, 'a/nan': NaN, 'a/empty': '' }
  const find = (params, extra) => findParametersAtModelValues(view(params, extra), (parameter) => model[parameter])

  it('finds those set to the model value everywhere, within rounding, in the view order', () => {
    expect(find({ 'a/text': [[-80], [-80, -80.00000000001]], 'a/g': [[0.12], [0.12, 0.1 + 0.02]], 'a/zero': [[0], [0, 0]] })).toEqual([
      'a/text',
      'a/g',
      'a/zero',
    ])
  })

  it('keeps those set to another number anywhere, however small the difference beyond rounding', () => {
    expect(find({ 'a/g': [[0.12], [0.12, 0.1200001]], 'a/zero': [[0], [1e-20, 0]] })).toEqual([])
  })

  it('keeps those set to a shape or a trace anywhere, even one holding the model value', () => {
    const extra = { protocol_shapes: { flat: { type: 'ramp', from: 0.12, to: 0.12 } }, protocol_traces: { held: { t: [0, 1], values: [0.12, 0.12] } } }
    expect(find({ 'a/g': [[0.12], [0.12, 'flat']] }, extra)).toEqual([])
    expect(find({ 'a/g': [['held'], [0.12, 0.12]] }, extra)).toEqual([])
  })

  it('keeps those whose model value is unknown, or not a number', () => {
    expect(find({ 'a/unknown': [[0], [0, 0]], 'a/nan': [[0], [0, 0]], 'a/empty': [[0], [0, 0]], 'a/missing': [[0], [0, 0]] })).toEqual([])
  })

  it('keeps those with a value that is not a finite number', () => {
    expect(find({ 'a/g': [[0.12], [0.12, null]] })).toEqual([])
    expect(find({ 'a/g': [[0.12], [0.12, Infinity]] })).toEqual([])
  })
})
