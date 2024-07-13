import { LucidRow, ModelAttributes } from '@ioc:Adonis/Lucid/Orm';
import { DateTime } from 'luxon';

const transactionFields = {
  fields: {
    pick: [
      'id', 'date', 'createdAt', 'sortOrder', 'type', 'comment', 'transactionCategories',
      'duplicateOfTransactionId', 'accountTransaction', 'version',
    ],
  },
  relations: {
    transactionCategories: {
      fields: {
        pick: ['id', 'type', 'categoryId', 'amount', 'expected', 'comment'],
      },
    },
    accountTransaction: {
      fields: {
        pick: [
          'name', 'amount', 'principle', 'paymentChannel', 'reconciled',
          'account', 'location', 'accountOwner', 'pending',
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

export function getChanges<T extends LucidRow>(
  original: T,
  updates: Partial<ModelAttributes<T>>,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  Object.keys(updates).forEach((k) => {
    if (DateTime.isDateTime(updates[k])) {
      if (!updates[k].equals(original[k])) {
        changes[k] = { old: original[k].toISO(), new: updates[k].toISO() }
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

export const getGoalDate = (goalDate?: DateTime | null, recurrence = 1): DateTime | null => {
  if (goalDate) {
    let adjustedGoal = goalDate
    const now = DateTime.now().startOf('month');

    const monthDiff = goalDate.startOf('month').diff(now, 'months').months;
    if (monthDiff < 0) {
      const numPeriods = Math.ceil(-monthDiff / recurrence);
      adjustedGoal = goalDate.plus({ months: numPeriods * recurrence })
    }

    return adjustedGoal;
  }

  return null;
}

export default transactionFields;
