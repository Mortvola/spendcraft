import { TrackingType } from '#common/ResponseTypes'
import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

export const addInstitutionCheck = vine.compile(
  vine.object({
    publicToken: vine.string().optional(),
  }),
)

export const addInstitution = vine.compile(
  vine.object({
    publicToken: vine.string(),
    institutionId: vine.string(),
  }),
)

export const addInstitutionOffline = vine.compile(
  vine.object({
    institution: vine.object({
      name: vine.string(),
    }),
    accounts: vine.array(
      vine.object({
        name: vine.string(),
        balance: vine.number(),
        type: vine.enum(
          ['depository', 'credit', 'loan', 'investment', 'other'] as const,
        ).optional(),
        subtype: vine.string(),
        tracking: vine.enum(TrackingType)
      }),
    ),
    startDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
  }),
)

export const addOfflineAccount = vine.compile(
  vine.object({
    name: vine.string(),
    balance: vine.number(),
    type: vine.enum(['depository', 'credit', 'loan', 'investment', 'other'] as const),
    subtype: vine.string(),
    tracking: vine.string(),
    rate: vine.number().optional(),
    startDate: vine.string(),
  }),
)

export const update = vine.compile(
  vine.object({
    name: vine.string(),
  })
)
