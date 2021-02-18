import { makeAutoObservable, runInAction } from 'mobx';

class Category {
  constructor(props) {
    this.id = props.id;
    this.name = props.name;
    this.system = props.system || false;
    this.balance = props.balance;

    makeAutoObservable(this);
  }

  async update(groupId, name) {
    const response = await fetch(`/groups/${groupId}/categories/${this.id}`, {
      method: 'PATCH',
      headers:
      {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    let body = null;
    if (/^application\/json/.test(response.headers.get('Content-Type'))) {
      body = await response.json();
    }

    if (!response.ok) {
      if (body && body.errors) {
        // Display the first error
        // TODO: Display all the errors?

        return body.errors;
      }
    }
    else {
      runInAction(() => {
        this.name = body.name;
      });
    }

    return null;
  }
}

export default Category;
