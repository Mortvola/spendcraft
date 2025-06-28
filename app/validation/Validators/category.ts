import { CategoryType } from '#common/ResponseTypes'
import vine from '@vinejs/vine'

export const addCategory = vine.compile(
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
  .withMetaData<{ budgetId: number }>()
  .compile(
    vine.object({
      name: vine.string().unique({
          table: 'groups',
          column: 'name',
          filter: (db, _value, field) => { db.where('application_id', field.meta.budgetId) },
        }),
      parentGroupId: vine.number().nullable().optional(),
    })
  )

  // public messages = {
  //   'name.required': 'A group name must be provided',
  //   'name.unique': 'The group name must be unique',
  // }

export const updateCategory = vine.compile(
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
    type: vine.enum([CategoryType.Regular, CategoryType.Bill, CategoryType.Goal] as const),
    goalDate: vine.date().optional(),
    recurrence: vine.number().optional(),
    suspended: vine.boolean().optional(),
    fundingAmount: vine.number().optional(),
    includeFundingTransfers: vine.boolean().optional(),
    hidden: vine.boolean(),
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
  //   'name.unique': 'The category name must be unique within the group',
  //   'name.required': 'The category name is required',
  // }

export const updateGroup = vine
  .withMetaData<{ budgetId: number, groupId: number | string }>()
  .compile(
    vine.object({
      name: vine.string().unique({
        table: 'groups',
        column: 'name',
        filter: (db, _value, field) => {
          db.
            where('application_id', field.meta.budgetId)
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

export const deleteCategory = vine.compile(
  vine.object({
    params: vine.object({
      catId: vine.number().transactionsExist(),
    }),
  })
)

  // public messages = {
  //   'params.catId.required': 'A category ids must be provided',
  //   'params.catId.transactionsExist': 'Before deleting, the category must not contain any transactions',
  // }

export const deleteGroup = vine.compile(
  vine.object({
    params: vine.object({
      groupId: vine.number().notExists({ table: 'categories', column: 'group_id' }),
    }),
  })
)

  // public messages = {
  //   'params.groupId.notExists': 'Before deleting, the group must not contain any categories',
  // }
