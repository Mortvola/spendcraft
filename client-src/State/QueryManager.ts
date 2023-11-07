import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { QueryManagerInterface } from './State';

class QueryManager implements QueryManagerInterface {
  fetching = false;

  fetchComplete = false;

  constructor() {
    makeAutoObservable(this);
  }

  async fetch(
    url: string,
    index: number,
    handleResponse: (body: unknown, index: number, limit: number) => boolean,
    qs?: string,
  ): Promise<void> {
    if (index === 0) {
      this.fetchComplete = false;
    }

    if (!this.fetching && !this.fetchComplete) {
      this.fetching = true;
      const limit = 30;
      let newUrl: string;

      if (url.includes('?')) {
        newUrl = `${url}&offset=${index ?? 0}&limit=${limit}`;
      }
      else {
        newUrl = `${url}?offset=${index ?? 0}&limit=${limit}`;
      }

      if (qs) {
        newUrl += `&${qs}`;
      }

      const response = await Http.get(newUrl);

      if (response.ok) {
        const body = await response.body();

        runInAction(() => {
          this.fetchComplete = handleResponse(body, index, limit);
          this.fetching = false;
        });
      }
      else {
        runInAction(() => {
          this.fetching = false;
        });
      }
    }
  }
}

export default QueryManager;
