import Http from '@mortvola/http';
import { makeObservable, observable, runInAction } from 'mobx';
import { AutoAssignmentInterface, AutoAssignmentProps } from './State';

class AutoAssignment implements AutoAssignmentInterface {
  id: number;

  name: string;

  searchStrings: string[] = [];

  categories: { id: number, categoryId: number, amount: number, percentage: boolean }[] = []

  constructor(props: AutoAssignmentProps) {
    this.id = props.id
    this.name = props.name

    this.searchStrings = props.searchStrings
    this.categories = props.categories

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
}

export default AutoAssignment;
