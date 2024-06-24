import Http from '@mortvola/http';
import { makeObservable, observable, runInAction } from 'mobx';
import { AutoAssignmentInterface, AutoAssignmentProps } from './State';

class AutoAssignment implements AutoAssignmentInterface {
  id: number;

  name: string;

  searchStrings: { id: number, searchString: string }[] = [];

  categories: { categoryId: number, amount: number, percent: boolean }[] = []

  constructor(props: AutoAssignmentProps) {
    this.id = props.id
    this.name = props.name

    this.searchStrings = props.searchStrings

    makeObservable(this, {
      name: observable,
      searchStrings: observable,
      categories: observable,
    })
  }

  async update(props: { name: string, searchStrings: { id: number, searchString: string }[] }) {
    const response = await Http.patch<unknown, AutoAssignmentProps>(`/api/v1/auto-assignments/${this.id}`, {
      name: props.name,
      searchStrings: props.searchStrings,
    })

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        this.name = body.name;
      })
    }
  }
}

export default AutoAssignment;
