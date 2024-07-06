import Http from '@mortvola/http';
import { makeObservable, observable, runInAction } from 'mobx';
import { AutoAssignmentInterface, AutoAssignmentProps, StoreInterface } from './Types';

class AutoAssignment implements AutoAssignmentInterface {
  id: number;

  name: string;

  searchStrings: string[] = [];

  categories: { id: number, categoryId: number, amount: number, percentage: boolean }[] = []

  store: StoreInterface;

  constructor(props: AutoAssignmentProps, store: StoreInterface) {
    this.id = props.id
    this.name = props.name

    this.searchStrings = props.searchStrings
    this.categories = props.categories

    this.store = store;

    makeObservable(this, {
      name: observable,
      searchStrings: observable,
      categories: observable,
    })
  }

  async update(props: {
    name: string,
    searchStrings: string[],
    categories: {
      id: number,
      categoryId: number,
      amount: number,
      percentage: boolean,
    }[],
  }) {
    const response = await Http.patch<unknown, AutoAssignmentProps>(`/api/v1/auto-assignments/${this.id}`, {
      name: props.name,
      searchStrings: props.searchStrings,
      categories: props.categories,
    })

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        this.name = body.name;
        this.searchStrings = body.searchStrings;
        this.categories = body.categories;
      })
    }
  }

  async delete(): Promise<void> {
    const response = await Http.delete(`/api/v1/auto-assignments/${this.id}`)

    if (response.ok) {
      runInAction(() => {
        this.store.autoAssignments.remove(this.id);
      })
    }
  }
}

export default AutoAssignment;
