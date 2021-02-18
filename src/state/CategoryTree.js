import { makeAutoObservable, runInAction } from 'mobx';
import Group from './Group';

class CategoryTree {
  constructor() {
    this.groups = [];
    this.systemIds = {
      systemGroupId: null,
      unassignedId: null,
      fundingPoolId: null,
    };

    makeAutoObservable(this);
  }

  getCategoryName(categoryId) {
    let categoryName = null;

    this.groups.find((group) => {
      const category = group.categories.find((cat) => cat.id === categoryId);

      if (category) {
        categoryName = `${group.name}:${category.name}`;
        return true;
      }

      return false;
    });

    return categoryName;
  }

  getFundingPoolAmount() {
    let fundingAmount = 0;

    const system = this.groups.find((g) => g.id === this.systemIds.systemGroupId);

    if (system) {
      const fundingPool = system.categories.find((c) => c.id === this.systemIds.fundingPoolId);

      if (fundingPool) {
        fundingAmount = fundingPool.amount;
      }
    }

    return fundingAmount;
  }

  async load() {
    const response = await fetch('/groups');

    const body = await response.json();

    if (body) {
      runInAction(() => {
        const systemGroup = body.find((g) => g.system);

        this.systemIds.systemGroupId = systemGroup.id;
        this.systemIds.unassignedId = systemGroup.categories.find((c) => c.system && c.name === 'Unassigned').id;
        this.systemIds.fundingPoolId = systemGroup.categories.find((c) => c.system && c.name === 'Funding Pool').id;

        body.forEach((g) => {
          const group = new Group(g);
          this.groups.push(group);
        });
      });
    }
  }

  async addGroup(name) {
    const response = await fetch('/groups', {
      method: 'POST',
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
        this.groups.push(new Group(body));
      });
    }

    return null;
  }

  async deleteGroup(id) {
    const index = this.groups.findIndex((g) => g.id === id);

    if (index !== -1) {
      const response = await fetch(`/groups/${id}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
        },
      });

      let body = null;
      if (/^application\/json/.test(response.headers.get('content-type'))) {
        body = await response.json();
      }

      if (!response.ok) {
        if (body && body.errors) {
          return body.errors;
        }
      }
      else {
        runInAction(() => {
          this.groups.splice(index, 1);
        });
      }
    }

    return null;
  }

  updateBalances(balances) {
    runInAction(() => {
      this.groups.forEach((g) => {
        g.updateBalances(balances);
      });
    });
  }
}

export default CategoryTree;