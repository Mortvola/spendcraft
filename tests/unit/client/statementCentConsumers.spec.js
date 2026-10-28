import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { DateTime } from 'luxon'
import { AccountType, RequestErrorCode } from '../../../common/ResponseTypes.ts'
import { parseMoneyCents, formatMoneyCents, subtractMoneyCents } from '../../../common/moneyCents.ts'
import { inputMoneyCents } from '../../../client-src/monetary.ts'

async function component(file, name, React) {
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) expression = node.initializer.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!expression) throw new Error('Missing Statement component')
  return runInNewContext(ts.transpileModule(`(${expression})`, { compilerOptions: {
    jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  } }).outputText, { React, AccountType, RequestErrorCode, inputMoneyCents, formatMoneyCents, parseMoneyCents, subtractMoneyCents,
    FormModal: 'modal', FormField: 'field', AmountField: 'amount', AmountInput: 'input', MoneyCentsAmount: 'display', styles: {} })
}
const createElement = (type, props, ...children) => ({ type, props: { ...props, children } })

test.group('Statement cent consumers', () => {
  test('input conversion retains exact strings and applies the existing signed rounding policy').with([
    ['90071992547409.91', 1, Number.MAX_SAFE_INTEGER], ['0.125', 1, 13], ['0.125', -1, -12],
    ['-0.125', -1, 13], [-0.005, 1, 0], ['-0.00', 1, 0], [0.1 + 0.2, 1, 30],
  ]).run(({ assert }, [value, sign, expected]) => assert.strictEqual(inputMoneyCents(value, sign), expected))

  test('balance dialog initializes exact values and submits cents for edits and creation').with([1, -1])
    .run(async ({ assert }, sign) => {
      let saved, created
      const closed = []
      const view = await component('client-src/AccountView/StatementDialog.tsx', 'StatementDialog', { createElement })
      const statement = { startDate: DateTime.fromISO('2025-01-01'), endDate: DateTime.fromISO('2025-01-31'),
        startingBalanceCents: parseMoneyCents('90071992547409.91'), endingBalanceCents: parseMoneyCents('0.30'),
        update: async values => { saved = values; return null } }
      const account = { sign, type: AccountType.Depository, statements: { addStatement: async (...values) => { created = values; return null } } }
      const modal = view({ account, statement, setShow: value => closed.push(value) })
      assert.strictEqual(modal.props.initialValues.startingBalance, `${sign === -1 ? '-' : ''}90071992547409.91`)
      await modal.props.onSubmit(modal.props.initialValues)
      assert.strictEqual(saved.startingBalanceCents, Number.MAX_SAFE_INTEGER)
      assert.strictEqual(saved.endingBalanceCents, 30)
      assert.notProperty(saved, 'startingBalance')
      const add = view({ account, setShow: value => closed.push(value) })
      await add.props.onSubmit({ ...add.props.initialValues, startDate: '2025-01-01', endDate: '2025-01-31',
        startingBalance: '0.125', endingBalance: '0.30' })
      assert.strictEqual(created[2], sign === -1 ? -12 : 13)
      assert.strictEqual(created[3], sign * 30)
      assert.deepEqual(closed, [false, false])
    })

  test('inline balance editor retains exact cents and applies account sign before rounding').with([1, -1])
    .run(async ({ assert }, sign) => {
      const slots = [], updates = []
      let cursor = 0
      const React = { createElement, useState(initial) {
        const index = cursor++
        if (!(index in slots)) slots[index] = initial
        return [slots[index], value => { slots[index] = value }]
      } }
      const view = await component('client-src/AccountView/StatementAmount.tsx', 'StatementAmount', React)
      const render = () => { cursor = 0; return view({ amount: parseMoneyCents('0.30'), sign, onUpdate: value => updates.push(value) }) }
      render().props.onClick()
      let input = render()
      assert.strictEqual(input.props.value, sign === -1 ? '-0.30' : '0.30')
      input.props.onKeyDown({ code: 'Enter' })
      assert.lengthOf(updates, 0)
      render().props.onClick()
      render().props.onChange({ target: { value: '0.125' } })
      input = render()
      input.props.onKeyDown({ code: 'Enter' })
      assert.deepEqual(updates, [sign === -1 ? -12 : 13])
    })
})
