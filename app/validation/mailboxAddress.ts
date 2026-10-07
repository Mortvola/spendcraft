import vine from '@vinejs/vine'

const invalidMailbox = 'A valid single mailbox address is required'
const controls = /[\u0000-\u001f\u007f-\u009f]/
const parserSyntax = /["()<>,;:\\]/

/** Validate recipients without changing case, provider aliases, or Unicode. */
export function mailboxAddress(value: string): string {
  if (controls.test(value)) {
    throw new Error(invalidMailbox)
  }

  const mailbox = value.trim()

  // validator.js isEmail limits the full string to 254 UTF-16 code units,
  // and separately limits the local part to 64 bytes and domain to 254 bytes.
  if (mailbox.length > 254 || parserSyntax.test(mailbox) || !vine.helpers.isEmail(mailbox, {
    allow_display_name: false,
    require_display_name: false,
    allow_utf8_local_part: true,
    require_tld: true,
    allow_ip_domain: false,
    allow_underscores: false,
    ignore_max_length: false,
  })) {
    throw new Error(invalidMailbox)
  }

  return mailbox
}

/** Run before entry normalization, which could otherwise erase unsafe input. */
export const mailboxRule = vine.createRule((value, _options: undefined, field) => {
  if (typeof value !== 'string') return

  try {
    mailboxAddress(value)
  } catch {
    field.report(invalidMailbox, 'email', field)
  }
})
