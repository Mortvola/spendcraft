import { makeAutoObservable, runInAction } from 'mobx';
import Category from './Category';
import Group from './Group';
import {
  CategoryProps, Error, isErrorResponse,
  isGroupProps, isGroupsResponse,
} from '../../common/ResponseTypes';
import { CategoryTreeInterface, StoreInterface } from './State';
import SystemIds from './SystemIds';
import { getBody, httpDelete, postJSON } from './Transports';

class CategoryTree implements CategoryTreeInterface {
  initialized = false;

  groups: Array<Group> = [];

  systemIds = new SystemIds();

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  getCategory(categoryId: number): Category | null {
    let category: Category | null = null;

    this.groups.find((group) => {
      const cat = group.categories.find((c) => c.id === categoryId);

      if (cat) {
        category = cat;
        return true;
      }

      return false;
    });

    return category;
  }

  getCategoryName(categoryId: number): string | null {
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

  getFundingPoolAmount(): number {
    let fundingAmount = 0;

    const system = this.groups.find((g) => g.id === this.systemIds.systemGroupId);

    if (system) {
      const fundingPool = system.categories.find((c) => c.id === this.systemIds.fundingPoolId);

      if (fundingPool) {
        fundingAmount = fundingPool.balance;
      }
    }

    return fundingAmount;
  }

  async load(): Promise<void> {
    const response = await fetch('/groups');

    const body = await getBody(response);

    if (isGroupsResponse(body)) {
      runInAction(() => {
        const systemGroup = body.find((g) => g.system);

        if (isGroupProps(systemGroup)) {
          this.systemIds.systemGroupId = systemGroup.id;
          const unassignedCategory = systemGroup.categories.find((c) => c.system && c.name === 'Unassigned');
          if (unassignedCategory) {
            this.systemIds.unassignedId = unassignedCategory.id;
          }
          const fundingPoolCategory = systemGroup.categories.find((c) => c.system && c.name === 'Funding Pool');
          if (fundingPoolCategory) {
            this.systemIds.fundingPoolId = fundingPoolCategory.id;
          }
        }

        body.forEach((g) => {
          const group = new Group(g);
          this.groups.push(group);
        });

        this.initialized = true;
      });
    }
  }

  async addGroup(name: string): Promise<null | Array<Error>> {
    const response = await postJSON('/groups', { name });

    const body = await getBody(response);

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        if (isGroupProps(body)) {
          this.groups.push(new Group(body));
        }
      });
    }

    return null;
  }

  async deleteGroup(id: number): Promise<null | Array<Error>> {
    const index = this.groups.findIndex((g) => g.id === id);

    if (index !== -1) {
      const response = await httpDelete(`/groups/${id}`);

      const body = await getBody(response);

      if (!response.ok) {
        if (isErrorResponse(body)) {
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

  updateBalances(balances: Array<CategoryProps>): void {
    runInAction(() => {
      this.groups.forEach((g) => {
        g.updateBalances(balances);
      });
    });
  }
}

export default CategoryTree;
