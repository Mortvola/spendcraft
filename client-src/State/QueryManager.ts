import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { QueryManagerState, QueryManagerInterface } from './Types';

class QueryManager implements QueryManagerInterface {
  state: QueryManagerState = 'IDLE';

  fetchComplete = false;

  url: string;

  constructor(url: string) {
    this.url = url;

    makeAutoObservable(this);
  }

  async fetch(
    index: number,
    handleResponse: (body: unknown, index: number, limit: number) => boolean,
    qs?: string,
  ): Promise<void> {
    if (index === 0) {
      this.fetchComplete = false;
    }

    if (this.state === 'IDLE' && !this.fetchComplete) {
      try {
        this.state = index === 0 ? 'LOADING' : 'LOADING-MORE';

        const limit = 30;
        let newUrl: string;

        if (this.url.includes('?')) {
          newUrl = `${this.url}&offset=${index ?? 0}&limit=${limit}`;
        }
        else {
          newUrl = `${this.url}?offset=${index ?? 0}&limit=${limit}`;
        }

        if (qs) {
          newUrl += `&${qs}`;
        }

        const response = await Http.get(newUrl);

        if (response.ok) {
          const body = await response.body();

          runInAction(() => {
            this.fetchComplete = handleResponse(body, index, limit);
            this.state = 'IDLE';
          });
        }
        else {
          runInAction(() => {
            this.state = 'IDLE';
          });
        }
      }
      catch (error) {
        this.state = 'IDLE';
        console.log(`fetch failed: ${error}`)
      }
    }
  }
}

export default QueryManager;
