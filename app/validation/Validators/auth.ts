import vine, { SimpleMessagesProvider } from '@vinejs/vine'

export const register = vine.compile(
  vine.object({
    username: vine.string().trim().unique({ table: 'users', column: 'username' }),
    email: vine.string().trim().normalizeEmail({ all_lowercase: true }).email().unique({ table: 'users', column: 'email' }),
    password: vine
      .string()
      .trim()
      .minLength(8)
      .maxLength(64)
      .regex(/.*[a-z].*$/)
      .regex(/.*[A-Z].*$/)
      .regex(/.*[0-9].*$/)
      .confirmed({ confirmationField: 'passwordConfirmation' }),
  })
)

export const updatePassword = vine.compile(
  vine.object({
    password: vine
      .string()
      .trim()
      .minLength(8)
      .maxLength(64)
      .regex(/.*?[a-z]$/)
      .regex(/.*?[A-Z]$/)
      .regex(/.*?[0-9]$/)
      .confirmed({ confirmationField: 'passwordConfirmation' }),
  })
)

export const registerMessageProvider = new SimpleMessagesProvider({
  'password.minLength': 'Passwords must be at least eight characters long',
  'password.maxLength': 'Passwords must be less than 65 characters long',
  'password.regex': 'Passswords must contain at least one lowercase letter, one uppercase letter and one digit',
  'password.confirmed': 'Passwords must match the confirmed password',
})
