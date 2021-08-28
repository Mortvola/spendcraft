import { makeAutoObservable, runInAction } from 'mobx';
import Category from './Category';
import Group from './Group';
import {
  CategoryBalanceProps,
  Error, isErrorResponse,
  isGroupProps, isGroupsResponse, isLoansGroupProps,
} from '../../common/ResponseTypes';
import { CategoryInterface, CategoryTreeInterface, StoreInterface } from './State';
import SystemIds from './SystemIds';
import { getBody, httpDelete, httpGet, postJSON } from './Transports';
import LoansGroup from './LoansGroup';

class CategoryTree implements CategoryTreeInterface {
  initialized = false;

  groups: (Group | LoansGroup)[] = [];

  systemIds = new SystemIds();

  unassignedCat: Category | null = null;

  fundingPoolCat: Category | null = null;

  accountTransferCat: Category | null = null;

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  getCategory(categoryId: number): CategoryInterface | null {
    let category: Category | null = null;

    this.groups.find((group) => {
      const cat = group.findCategory(categoryId);

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
      const category = group.findCategory(categoryId);

      if (category) {
        categoryName = `${group.name}:${category.name}`;
        return true;
      }

      return false;
    });

    return categoryName;
  }

  async load(): Promise<void> {
    const response = await httpGet('/api/groups');

    const body = await getBody(response);

    if (isGroupsResponse(body)) {
      runInAction(() => {
        const systemGroup = body.find((g) => g.system && g.name === 'System');

        if (isGroupProps(systemGroup)) {
          this.systemIds.systemGroupId = systemGroup.id;

          const unassignedCategory = systemGroup.categories.find((c) => c.type === 'UNASSIGNED');
          if (unassignedCategory) {
            this.unassignedCat = new Category(unassignedCategory, this.store);
          }

          const fundingPoolCategory = systemGroup.categories.find((c) => c.type === 'FUNDING POOL');
          if (fundingPoolCategory) {
            this.fundingPoolCat = new Category(fundingPoolCategory, this.store);
          }

          const accountTransferCategory = systemGroup.categories.find((c) => c.type === 'ACCOUNT TRANSFER');
          if (accountTransferCategory) {
            this.accountTransferCat = new Category(accountTransferCategory, this.store);
          }
        }

        body.forEach((g) => {
          if (isLoansGroupProps(g)) {
            this.systemIds.loansGroupId = g.id;

            const loans = new LoansGroup(g, this.store);
            this.groups.push(loans);
          }
          else {
            const group = new Group(g, this.store);
            this.groups.push(group);
          }
        });

        this.initialized = true;
      });
    }
  }

  async addGroup(name: string): Promise<null | Error[]> {
    const response = await postJSON('/api/groups', { name });

    const body = await getBody(response);

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        if (isGroupProps(body)) {
          // Find the position where this new group should be inserted.
          const index = this.groups.findIndex(
            (g) => body.name.toLowerCase().localeCompare(g.name.toLowerCase()) < 0,
          );

          if (index === -1) {
            this.groups.push(new Group(body, this.store));
          }
          else {
            this.groups = [
              ...this.groups.slice(0, index),
              new Group(body, this.store),
              ...this.groups.slice(index),
            ];
          }
        }
      });
    }

    return null;
  }

  async deleteGroup(id: number): Promise<null | Array<Error>> {
    const index = this.groups.findIndex((g) => g.id === id);

    if (index !== -1) {
      const response = await httpDelete(`/api/groups/${id}`);

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

  updateBalances(balances: CategoryBalanceProps[]): void {
    runInAction(() => {
      this.groups.forEach((g) => {
        g.updateBalances(balances);
      });
    });
  }
}

export default CategoryTree;
