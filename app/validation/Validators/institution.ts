import vine from '@vinejs/vine'

export const update = vine.compile(
  vine.object({
    name: vine.string(),
  })
)
