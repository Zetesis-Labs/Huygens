import { describe, expect, test } from 'bun:test'
import { assertTestNamespace } from './_fixtures'

describe('assertTestNamespace', () => {
  test('accepts throwaway test/e2e namespaces', () => {
    expect(() => assertTestNamespace('huygens_test_ab12cd34')).not.toThrow()
    expect(() => assertTestNamespace('huygens_e2e_ff00ff00')).not.toThrow()
  })

  test('refuses the production namespace', () => {
    expect(() => assertTestNamespace('huygens')).toThrow(/refusing/)
  })

  test('refuses anything that is not a recognized throwaway namespace', () => {
    expect(() => assertTestNamespace('main')).toThrow()
    expect(() => assertTestNamespace('huygens_prod')).toThrow()
    expect(() => assertTestNamespace('huygensX_test_1')).toThrow()
  })
})
