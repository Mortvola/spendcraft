import { makeAutoObservable, runInAction } from 'mobx';
import Category from './Category';

class Group {
  constructor(props) {
    this.id = props.id;
    this.name = props.name;
    this.system = props.system || false;
    this.categories = [];

    if (props.categories && props.categories.length > 0) {
      props.categories.forEach((c) => {
        const category = new Category(c);
        this.categories.push(category);
      });
    }

    makeAutoObservable(this);
  }

  async addCategory({ groupId, name }) {
    const response = await fetch(`/groups/${groupId}/categories`, {
      method: 'POST',
      headers:
      {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ groupId, name }),
    });

    let body = null;
    if (/^application\/json/.test(response.headers.get('Content-Type'))) {
      body = await response.json();
    }

    if (!response.ok) {
      if (body && body.errors) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        this.categories.push(new Category(body));
      });
    }

    return null;
  }

  async update(name) {
    const response = await fetch(`/groups/${this.id}`, {
      method: 'PATCH',
      headers: {
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

  async deleteCategory(groupId, categoryId) {
    const index = this.categories.findIndex((c) => c.id === categoryId);

    if (index !== -1) {
      const response = await fetch(`/groups/${groupId}/categories/${categoryId}`, {
        method: 'DELETE',
        headers:
        {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
          'Content-Type': 'application/json',
        },
      });

      let body = null;
      if (/^application\/json/.test(response.headers.get('Content-Type'))) {
        body = await response.json();
      }

      if (!response.ok) {
        if (body && body.errors) {
          return body.errors;
        }
      }
      else {
        runInAction(() => {
          this.categories.splice(index, 1);
        });
      }
    }

    return null;
  }

  updateBalances(balances) {
    this.categories.forEach((c) => {
      const balance = balances.find((b) => b.id === c.id);
      if (balance) {
        c.balance = balance.amount;
      }
    });
  }
}

export default Group;
