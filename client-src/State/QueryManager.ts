import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { QueryManagerState, QueryManagerInterface } from './Types';
import { ApiResponse } from '../../common/ResponseTypes';

class QueryManager<T> implements QueryManagerInterface {
  @observable
  accessor state: QueryManagerState = 'IDLE';

  @observable
  accessor fetchComplete = false;

  async fetch(
    url: string,
    index: number,
    handleResponse: (data: T, index: number, limit: number) => boolean,
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

        const response = await Http.get<ApiResponse<T>>(newUrl);

        if (response.ok) {
          const { data } = await response.body();

          runInAction(() => {
            if (data) {
              this.fetchComplete = handleResponse(data, index, limit);
              this.state = 'IDLE';
            }
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
