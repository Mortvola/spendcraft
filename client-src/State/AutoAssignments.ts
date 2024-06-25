import Http from '@mortvola/http';
import { makeObservable, observable, runInAction } from 'mobx';
import AutoAssignment from './AutoAssignment';
import {
  AutoAssignmentProps, AutoAssignmentsInterface, AutoAssignmentsResponse, StoreInterface,
} from './State';

class AutoAssignments implements AutoAssignmentsInterface {
  autoAssignemnts: AutoAssignment[] = [];

  initialized = false;

  store: StoreInterface;

  constructor(store: StoreInterface) {
    this.store = store;

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
        this.autoAssignemnts = body.map((props) => new AutoAssignment(props, this.store));

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
        const autoAssignment = new AutoAssignment(body, this.store)

        runInAction(() => {
          // Find the position to insert the new assignment.
          const index = this.autoAssignemnts.findIndex((n) => (autoAssignment.name.localeCompare(n.name) < 0));

          if (index === -1) {
            // No assignment was found that was greater lexically so at it to the end.
            this.autoAssignemnts = this.autoAssignemnts.concat(autoAssignment)
          }
          else {
            this.autoAssignemnts = [
              ...this.autoAssignemnts.slice(0, index),
              autoAssignment,
              ...this.autoAssignemnts.slice(index),
            ];
          }
        })
      })
    }
  }

  remove(id: number) {
    const index = this.autoAssignemnts.findIndex((a) => a.id === id);

    if (index !== -1) {
      this.autoAssignemnts = [
        ...this.autoAssignemnts.slice(0, index),
        ...this.autoAssignemnts.slice(index + 1),
      ]
    }
  }
}

export default AutoAssignments;
