import { IDBPDatabase, openDB } from 'idb';
import Http from '@mortvola/http';
import { ApiResponse, SyncResponse } from '../../common/ResponseTypes';

const initializeDatabase = async (): Promise<IDBPDatabase<unknown>> => {
  const newDb = await openDB('SpendCraft', 1, {
    upgrade(db) {
      db.createObjectStore('revision')

      const trxStore = db.createObjectStore('transactions', { keyPath: 'id' })

      trxStore.createIndex('categoryId', 'categories', { multiEntry: true })

      trxStore.createIndex('accountId', 'accountId')

      db.createObjectStore('institutions', { keyPath: 'id' })

      db.createObjectStore('accounts', { keyPath: 'id' })
    },
  });

  return newDb;
}

const sync = async (db: IDBPDatabase) => {
  try {
    const revisions = await db.getAll('revision');
    // console.log(revisions);

    let url = '/api/v1/budgets/sync?since=01-04-2024';
    if (revisions.length !== 0) {
      url = `/api/v1/budgets/sync?revision=${revisions[0]}&since=01-04-2024`;
    }

    const response = await Http.post<void, ApiResponse<SyncResponse>>(url);

    if (response) {
      const body = await response.body();

      if (body.data) {
        const { transactions: { modified: transactions }, revision } = body.data;

        const trx = db.transaction(['transactions', 'revision'], 'readwrite');

        await trx.objectStore('revision').put(revision, 0)

        const transactionStore = trx.objectStore('transactions');

        for (let i = 0; i < transactions.length; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          const transaction = await transactionStore.get(transactions[i].id!)

          try {
            if (!transaction || transaction.data.version < transactions[i].version) {
              // eslint-disable-next-line no-await-in-loop
              await transactionStore.put({
                id: transactions[i].id,
                accountId: transactions[i].accountTransaction.account.id,
                categories: transactions[i].transactionCategories.map((tc) => tc.categoryId),
                data: transactions[i],
              })
            }
          }
          catch (error) {
            console.log(`${error}, id = ${transactions[i].id}`)
          }
        }

        await trx.done
      }
    }
  }
  catch (error) {
    console.log(error);
  }
}

// eslint-disable-next-line import/prefer-default-export
export const db = await initializeDatabase();

await sync(db);
