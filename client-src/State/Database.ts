import { IDBPDatabase, openDB } from 'idb';
import Http from '@mortvola/http';
import { TransactionsResponse } from '../../common/ResponseTypes';

const initializeDatabase = async (): Promise<IDBPDatabase<unknown>> => {
  const newDb = await openDB('SpendCraft', 1, {
    upgrade(db) {
      const trxStore = db.createObjectStore('transactions', { keyPath: 'id' })

      trxStore.createIndex('categoryId', 'categories', { multiEntry: true })

      trxStore.createIndex('accountId', 'accountId')

      db.createObjectStore('institutions', { keyPath: 'id' })

      db.createObjectStore('accounts', { keyPath: 'id' })
    },
  });

  try {
    const response = await Http.get<TransactionsResponse>('/api/v1/transactions?since=01-04-2024');

    if (response) {
      const body = await response.body();

      const trx = newDb.transaction(['transactions'], 'readwrite');

      const transactionStore = trx.objectStore('transactions');

      const { transactions } = body;

      for (let i = 0; i < transactions.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const transaction = await transactionStore.get(transactions[i].id!)

        try {
          if (!transaction || transaction.version < transactions[i].version) {
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
    }
  }
  catch (error) {
    console.log(error);
  }

  return newDb;
}

// eslint-disable-next-line import/prefer-default-export
export const db = await initializeDatabase();
