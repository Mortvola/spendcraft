import { test } from '@japa/runner'
import { addInstitutionOffline, addOfflineAccount } from
  '../../app/validation/Validators/institution.ts'
import { AccountType, TrackingType } from '../../common/ResponseTypes.ts'

test.group('Offline account balance request contract', () => {
  const account = balance => ({ name: 'Offline', balance, type: AccountType.Depository,
    subtype: 'checking', tracking: TrackingType.Balances, startDate: '2025-01-01', rate: 3.125 })
  const institution = balance => ({ institution: { name: 'Bank' }, accounts: [account(balance)],
    startDate: '2025-01-01' })
  test('canonical balances decode numerically without changing nonmonetary fields').with(['12.35',
    '-0.12', '0.00', '0.30'])
    .run(async ({ assert }, balance) => {
      const created = await addOfflineAccount.validate(account(balance))
      const batch = await addInstitutionOffline.validate(institution(balance))
      assert.strictEqual(created.balance, Number(balance))
      assert.strictEqual(batch.accounts[0].balance, Number(balance))
      assert.strictEqual(created.rate, 3.125)
      assert.strictEqual(created.type, AccountType.Depository)
      assert.strictEqual(batch.accounts[0].tracking, TrackingType.Balances)
    })
  test('numeric, noncanonical, missing and unsafe balances reject on both routes').with([
    1, 0, -0, null, undefined, true, '', '1', '1.2', '1.005', '1e2', '+1.00', '01.00', '-0.00',
    ' 1.00 ', 'Infinity', '90071992547409.92', Infinity, NaN,
  ]).run(async ({ assert }, balance) => {
    await assert.rejects(() => addOfflineAccount.validate(account(balance)))
    await assert.rejects(() => addInstitutionOffline.validate(institution(balance)))
  })
  test('every account in an institution batch requires a canonical balance', async ({ assert }) => {
    const values = institution('1.00')
    values.accounts.push(account(2))
    await assert.rejects(() => addInstitutionOffline.validate(values))
  })
})
