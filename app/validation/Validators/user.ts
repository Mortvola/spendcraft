import vine from '@vinejs/vine'

export const update = vine.compile(
  vine.object({
    email: vine.string().trim().normalizeEmail({ all_lowercase: true }).unique({ table: 'users', column: 'email' }),
  })
)

export const addApnsToken = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(1)
  }), 
)