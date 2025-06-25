import vine from '@vinejs/vine'

export const update = vine.compile(
  vine.object({
    email: vine.string().trim().normalizeEmail({ all_lowercase: true }).unique({ table: 'users', column: 'email' }),
  })
)