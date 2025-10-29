import vine, { SimpleMessagesProvider } from '@vinejs/vine'

const passwordMessageProvider = new SimpleMessagesProvider({
  'password.minLength': 'Passwords must be at least eight characters long',
  'password.maxLength': 'Passwords must be less than 65 characters long',
  'password.regex': 'Passswords must contain at least one lowercase letter, one uppercase letter and one digit',
  'password.confirmed': 'Passwords must match the confirmed password',
})

const passwordValidation = vine
  .string()
  .trim()
  .minLength(8)
  .maxLength(64)
  .regex(/.*[a-z].*$/)
  .regex(/.*[A-Z].*$/)
  .regex(/.*[0-9].*$/)
  .confirmed({ confirmationField: 'passwordConfirmation' })

export const register = vine.compile(
  vine.object({
    username: vine.string().trim().unique({ table: 'users', column: 'username' }),
    email: vine.string().trim().normalizeEmail({ all_lowercase: true }).email().unique({ table: 'users', column: 'email' }),
    password: passwordValidation,
  })
)

register.messagesProvider = passwordMessageProvider

export const updatePassword = vine.compile(
  vine.object({
    password: passwordValidation,
  })
)

updatePassword.messagesProvider = passwordMessageProvider

export const login = vine.compile(
  vine.object({
    username: vine.string().trim(),
    password: vine.string().trim(),
  }),
)

login.messagesProvider = new SimpleMessagesProvider({
  'username.required': 'A username is required',
  'password.required': 'A password is required',
})

export const refresh = vine.compile(
  vine.object({
    data: vine.object({
      refresh: vine.string(),
    }),
  }),
)

export const logout = vine.compile(
  vine.object({
    data: vine.object({
      refresh: vine.string(),
    }),
  }),
)

export const requestCode = vine.compile(
  vine.object({
    email: vine.string().email(),
  }),
)

requestCode.messagesProvider = new SimpleMessagesProvider({
  'email.email': 'A valid email address must be provided',
})

export const verifyCode = vine.compile(
  vine.object({
    email: vine.string(),
    code: vine.string(),
  }),
)