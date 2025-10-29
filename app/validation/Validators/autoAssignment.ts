import vine from '@vinejs/vine'

export const addAutoAssignment = vine.compile(
  vine.object({
    name: vine.string().trim(),
    searchStrings: vine.array(vine.string()),
    categories: vine.array(
      vine.object({
        id: vine.number(),
        categoryId: vine.number(),
        amount: vine.number(),
        percentage: vine.boolean(),
      }),
    ),
  }),
)

export const updateAutoAssignment = vine.compile(
  vine.object({
    name: vine.string().trim(),
    searchStrings: vine.array(vine.string()),
    categories: vine.array(
      vine.object({
        id: vine.number(),
        categoryId: vine.number(),
        amount: vine.number(),
        percentage: vine.boolean(),
      }),
    ),
  }),
)