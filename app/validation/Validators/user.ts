import vine, { SimpleMessagesProvider } from '@vinejs/vine'
import { mailboxRule } from '../mailboxAddress.js'

export const update = vine.compile(
  vine.object({
    email: vine.string().use(mailboxRule()).trim().normalizeEmail({ all_lowercase: true }).email().unique({ table: 'users', column: 'email' }),
  })
)

update.messagesProvider = new SimpleMessagesProvider({
  'email.email': 'The email address is not valid.',
  'email.unique': 'This email address is already in use.',
})

export const addApnsToken = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(1)
  }), 
)