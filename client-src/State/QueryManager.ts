import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';

class QueryManager {
  state: 'IDLE' | 'LOADING' | 'LOADING-MORE' = 'IDLE';

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

    if (this.state === 'IDLE' && !this.fetchComplete) {
      try {
        this.state = index === 0 ? 'LOADING' : 'LOADING-MORE';

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
