import { CategoryType } from '#common/ResponseTypes'
import vine from '@vinejs/vine'

export const addCategory = vine
  .withMetaData<{ groupId: number }>()
  .compile(
    vine.object({
      name: vine.string().unique({
          table: 'categories',
          column: 'name',
          filter: (db, _value, field) => { db.where('group_id', field.meta.groupId) },
        }),
      monthlyExpenses: vine.boolean().optional(),
      type: vine.enum([CategoryType.Regular, CategoryType.Bill, CategoryType.Goal]).optional(),
      fundingAmount: vine.number().optional(),
      includeFundingTransfers: vine.boolean().optional(),
      goalDate: vine.date().optional(),
      recurrence: vine.number().optional(),
      useGoal: vine.boolean(),
      fundingCategories: vine.array(
        vine.object({
          categoryId: vine.number(),
          amount: vine.number(),
          percentage: vine.boolean(),
        }),
      ),
    })
  )

  // public messages = {
  //   'name.required': 'A category name must be provided',
  //   'name.unique': 'The category name must be unique within a group',
  // }

export const addGroup = vine
  .withMetaData<{ budgetId: number, noGroupId: number }>()
  .compile(
    vine.object({
      name: vine.string().unique({
          table: 'groups',
          column: 'name',
          filter: (db, _value, field) => {
            db
              .where('application_id', field.meta.budgetId)
              .andWhereRaw('COALESCE(parent_group_id, ??) = ?', [field.meta.noGroupId, field.data.parentGroupId])
          },
        }),
      parentGroupId: vine.number().nullable().optional(),
    })
  )

  // public messages = {
  //   'name.required': 'A group name must be provided',
  //   'name.unique': 'The group name must be unique',
  // }

export const updateCategory = vine
  .withMetaData<{ groupId: number, catId: number }>()
  .compile(
    vine.object({
      name: vine.string().unique({
        table: 'categories',
        column: 'name',
        filter: (db, _value, field) => {
          db.where('group_id', field.meta.groupId)
            .andWhereNot('id', field.meta.catId)
        }
      }),
      monthlyExpenses: vine.boolean().optional(),
      type: vine.enum([CategoryType.Regular, CategoryType.Bill, CategoryType.Goal] as const).optional(),
      goalDate: vine.date().optional(),
      recurrence: vine.number().optional(),
      suspended: vine.boolean().optional(),
      fundingAmount: vine.number().optional(),
      includeFundingTransfers: vine.boolean().optional(),
      hidden: vine.boolean().optional(),
      useGoal: vine.boolean().optional(),
      fundingCategories: vine.array(
        vine.object({
          categoryId: vine.number(),
          amount: vine.number(),
          percentage: vine.boolean(),
        }),
      ).optional(),
    })
)

  // public messages = {
  //   'name.unique': 'The category name must be unique within the group',
  //   'name.required': 'The category name is required',
  // }

export const updateGroup = vine
  .withMetaData<{ budgetId: number, groupId: number | string, noGroupId: number }>()
  .compile(
    vine.object({
      name: vine.string().unique({
        table: 'groups',
        column: 'name',
        filter: (db, _value, field) => {
          db
            .where('application_id', field.meta.budgetId)
            .andWhereRaw(`COALESCE(parent_group_id, ??) = ?`, [field.meta.noGroupId, field.data.parentGroupId])
            .andWhereNot('id', field.meta.groupId)
        },
      }).optional(),
      parentGroupId: vine.number().nullable().optional(),
      hidden: vine.boolean().optional(),
    })
  )

  // public messages = {
  //   'name.required': 'A group name must be provided',
  //   'name.unique': 'The group name must be unique',
  // }
