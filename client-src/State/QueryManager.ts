import { makeAutoObservable, runInAction } from 'mobx';
import { QueryManagerInterface } from './State';
import { getBody, httpGet } from './Transports';

class QueryManager implements QueryManagerInterface {
  fetching = false;

  fetchComplete = false;

  constructor() {
    makeAutoObservable(this);
  }

  async fetch(
    url: string,
    index = 0,
    handleResponse: (body: unknown, index: number, limit: number) => boolean,
  ): Promise<void> {
    if (index === 0) {
      this.fetchComplete = false;
    }

    if (!this.fetching && !this.fetchComplete) {
      this.fetching = true;
      const limit = 30;
      const response = await httpGet(`${url}?offset=${index ?? 0}&limit=${limit}`);

      if (response.ok) {
        const body = await getBody(response);

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
