import Http from '@mortvola/http';
import { makeObservable, observable, runInAction } from 'mobx';
import AutoAssignment from './AutoAssignment';
import { AutoAssignmentProps, AutoAssignmentsResponse } from './State';

class AutoAssignments {
  autoAssignemnts: AutoAssignment[] = [];

  initialized = false;

  constructor() {
    makeObservable(this, {
      autoAssignemnts: observable,
    })
  }

  async load(): Promise<void> {
    const response = await Http.get<AutoAssignmentsResponse>('/api/v1/auto-assignments');

    if (!response.ok) {
      throw new Error('invalid response');
    }

    const body = await response.body();

    if (body) {
      runInAction(() => {
        this.autoAssignemnts = body.map((props) => new AutoAssignment(props));

        this.initialized = true;
      });
    }
  }

  async add(props: {
    name: string,
    searchStrings: string[],
    categories: {
      id: number,
      categoryId: number,
      amount: number,
      percentage: boolean,
    }[],
  }) {
    const response = await Http.post<unknown, AutoAssignmentProps>('/api/v1/auto-assignments', {
      name: props.name,
      searchStrings: props.searchStrings,
      categories: props.categories,
    })

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        const autoAssignment = new AutoAssignment(body)

        runInAction(() => {
          this.autoAssignemnts = this.autoAssignemnts.concat(autoAssignment)
        })
      })
    }
  }
}

export default AutoAssignments;
