import { makeAutoObservable, runInAction } from 'mobx';
import { DateTime } from 'luxon';
import { QueryManagerInterface, QueryManagerState } from './Types';
import { db } from './Database';
import { TransactionProps } from '../../common/ResponseTypes';

class LocalQueryManager implements QueryManagerInterface {
  state: QueryManagerState = 'IDLE';

  fetchComplete = false;

  url: string;

  constructor(url: string) {
    this.url = url;

    makeAutoObservable(this);
  }

  // eslint-disable-next-line class-methods-use-this
  async fetch(
    index: number,
    handleResponse: (body: unknown, index: number, limit: number) => boolean,
    qs?: string,
  ): Promise<void> {
    runInAction(() => {
      this.state = 'LOADING'
    })

    if (db) {
      const trx = db.transaction(['transactions'], 'readonly');

      const [, indexName, id] = this.url.split(':');

      let cursor = await trx.objectStore('transactions').index(indexName).openCursor(parseInt(id, 10));

      const transactions: unknown[] = [];

      while (cursor) {
        transactions.push(cursor.value.data);
        // eslint-disable-next-line no-await-in-loop
        cursor = await cursor.continue();
      }

      (transactions as TransactionProps[])
        .sort((a, b) => DateTime.fromISO(b.date).toMillis() - DateTime.fromISO(a.date).toMillis());

      handleResponse({
        transactions,
        balance: 0,
      }, index, 30);
    }

    runInAction(() => {
      this.fetchComplete = true;
      this.state = 'IDLE'
    })
  }
}

export default LocalQueryManager;
