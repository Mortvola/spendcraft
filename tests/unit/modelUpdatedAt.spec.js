import { test } from '@japa/runner'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const models = ['Transaction', 'Account', 'AccountTransaction', 'Category', 'Group', 'Institution']

// Compile each real model's timestamp declaration without bootstrapping its
// application/provider dependencies. Saves use Lucid and an inert adapter.
async function timestampModel(name) {
  const source = ts.createSourceFile(`${name}.ts`, await readFile(`app/Models/${name}.ts`, 'utf8'), ts.ScriptTarget.Latest, true)
  const model = source.statements.find((node) => ts.isClassDeclaration(node))
  const timestamp = model.members.find((node) => node.name?.getText(source) === 'updatedAt')
  if (!timestamp) throw new Error(`${name} has no updatedAt declaration`)
  const context = { BaseModel, column, DateTime }
  runInNewContext(ts.transpileModule(`class TimestampModel extends BaseModel { ${timestamp.getText(source)} }
globalThis.TimestampModel = TimestampModel`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
  }).outputText, context)
  const Sample = context.TimestampModel
  Sample.boot()
  Sample.$addColumn('id', { isPrimary: true })
  Sample.$addColumn('comment', {})
  const writes = []
  Sample.$adapter = {
    query() { return { client: { dialect: { dateTimeFormat: 'yyyy-MM-dd HH:mm:ss.SSSZZ' } } } },
    async update(_model, values) { writes.push(values) },
  }
  return { Sample, writes }
}

test.group('Active model update timestamps (no database)', () => {
  test('dirty saves refresh updated_at and keep it private').with(models).run(async ({ assert }, name) => {
    const { Sample, writes } = await timestampModel(name)
    const old = DateTime.fromISO('2020-01-01T00:00:00Z')
    const model = Sample.$createFromAdapterResult({ id: 1, comment: 'old', updated_at: old.toSQL() })
    model.comment = 'changed'
    await model.save()
    assert.lengthOf(writes, 1)
    assert.isTrue(model.updatedAt.toMillis() > old.toMillis())
    assert.property(writes[0], 'updated_at')
    assert.equal(writes[0].comment, 'changed')
    assert.notProperty(model.serialize(), 'updatedAt')
    assert.notProperty(model.serialize(), 'updated_at')
    assert.isFalse(model.$isDirty)
    const saved = model.updatedAt.toMillis()
    await model.save()
    assert.lengthOf(writes, 1)
    assert.equal(model.updatedAt.toMillis(), saved)
  })

  test('quiet saves also refresh timestamps; inserts initialize missing timestamps').with(models).run(async ({ assert }, name) => {
    const { Sample, writes } = await timestampModel(name)
    const model = Sample.$createFromAdapterResult({ id: 1, comment: 'old', updated_at: '2020-01-01 00:00:00+00' })
    model.comment = 'changed'
    await model.saveQuietly()
    assert.lengthOf(writes, 1)
    assert.property(writes[0], 'updated_at')
    assert.isTrue(model.updatedAt.year > 2020)
    const fresh = new Sample()
    fresh.initiateAutoCreateColumns()
    assert.isTrue(DateTime.isDateTime(fresh.updatedAt))
  })
})
