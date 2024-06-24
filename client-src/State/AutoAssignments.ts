import Http from '@mortvola/http';
import { makeObservable, observable, runInAction } from 'mobx';
import AutoAssignment from './AutoAssignment';
import { AutoAssignmentsResponse } from './State';

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
}

export default AutoAssignments;
