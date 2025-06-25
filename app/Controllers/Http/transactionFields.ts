import { DateTime } from 'luxon';
import { ModelObject } from "@adonisjs/lucid/types/model";

const transactionFields = {
  fields: {
    pick: [
      'id', 'date', 'createdAt', 'sortOrder', 'type', 'comment', 'categories',
      'duplicateOfTransactionId', 'accountTransaction', 'version',
    ],
  },
  relations: {
    accountTransaction: {
      fields: {
        pick: [
          'name', 'amount', 'principle', 'paymentChannel',
          'account', 'location', 'accountOwner', 'pending', 'statementId',
        ],
      },
      relations: {
        account: {
          fields: {
            pick: ['id', 'name', 'institution'],
          },
          relations: {
            institution: {
              fields: {
                pick: ['name'],
              },
            },
          },
        },
      },
    },
  },
};

function getObjectChanges(
  original: Record<string, unknown>,
  updates: Record<string, unknown>,
  changes: Record<string, unknown>,
) {
  Object.keys(updates).forEach((k) => {
    if (DateTime.isDateTime(updates[k])) {
      if (!(updates[k] as DateTime).equals(original[k] as DateTime)) {
        changes[k] = { old: (original[k] as DateTime).toISO(), new: (updates[k] as DateTime).toISO() }
      }
    }
    else if (updates[k] === null) {
      if (original[k] !== null) {
        changes[k] = { old: original[k], new: updates[k] };
      }
    }
    else if (typeof updates[k] === 'object') {
      if (original[k] === null) {
        changes[k] = { old: original[k], new: updates[k] }
      }
      else {
        const objectChanges = getObjectChanges(
          original[k] as Record<string, unknown>,
          updates[k] as Record<string, unknown>,
          {},
        )

        if (Object.keys(objectChanges).length > 0) {
          changes[k] = objectChanges;
        }
      }
    }
    else if (updates[k] !== undefined && updates[k] !== original[k]) {
      changes[k] = { old: original[k], new: updates[k] }
    }
  })

  return changes;
}

export function getChanges<T extends ModelObject>(
  original: T,
  updates: T,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  Object.keys(updates).forEach((k) => {
    if (DateTime.isDateTime(updates[k])) {
      const date = updates[k] as DateTime
      if (!updates[k].equals(date)) {
        changes[k] = { old: date.toISO(), new: updates[k].toISO() }
      }
    }
    else if (updates[k] === null) {
      if (original[k] !== null) {
        changes[k] = { old: original[k], new: updates[k] }
      }
    }
    else if (typeof updates[k] === 'object') {
      if (original[k] === null) {
        changes[k] = { old: original[k], new: updates[k] }
      }
      else if (Array.isArray(updates[k])) {
        // TODO: Implement handling of arrays
      }
      else {
        const objectChanges = getObjectChanges(original[k], updates[k], {})

        if (Object.keys(objectChanges).length > 0) {
          changes[k] = objectChanges;
        }
      }
    }
    else if (updates[k] !== undefined && updates[k] !== original[k]) {
      changes[k] = { old: original[k], new: updates[k] }
    }
  })

  return changes;
}

export default transactionFields;
