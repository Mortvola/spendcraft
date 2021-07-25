import { makeAutoObservable, runInAction } from 'mobx';
import Category from './Category';
import Group from './Group';
import {
  CategoryProps, Error, isErrorResponse,
  isGroupProps, isGroupsResponse, isLoanGroupProps,
} from '../../common/ResponseTypes';
import { CategoryTreeInterface, StoreInterface } from './State';
import SystemIds from './SystemIds';
import { getBody, httpDelete, postJSON } from './Transports';
import LoansGroup from './LoansGroup';
import Loan from './Loan';

class CategoryTree implements CategoryTreeInterface {
  initialized = false;

  groups: (Group | LoansGroup)[] = [];

  systemIds = new SystemIds();

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  getCategory(categoryId: number): Category | Loan | null {
    let category: Category | Loan | null = null;

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

  getFundingPoolAmount(): number {
    let fundingAmount = 0;

    const fundingPool = this.getCategory(this.systemIds.fundingPoolId);

    if (fundingPool) {
      fundingAmount = fundingPool.balance;
    }

    return fundingAmount;
  }

  async load(): Promise<void> {
    const response = await fetch('/api/groups');

    const body = await getBody(response);

    if (isGroupsResponse(body)) {
      runInAction(() => {
        const systemGroup = body.find((g) => g.system && g.name === 'System');

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
          if (g.system && g.name === 'Loans') {
            this.systemIds.loansGroupId = g.id;

            if (!isLoanGroupProps(g)) {
              throw new Error('invalid loan group props');
            }

            const loans = new LoansGroup(g);
            this.groups.push(loans);
          }
          else {
            const group = new Group(g);
            this.groups.push(group);
          }
        });

        this.initialized = true;
      });
    }
  }

  async addGroup(name: string): Promise<null | Array<Error>> {
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
            this.groups.push(new Group(body));
          }
          else {
            this.groups = [
              ...this.groups.slice(0, index),
              new Group(body),
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

  updateBalances(balances: CategoryProps[]): void {
    runInAction(() => {
      this.groups.forEach((g) => {
        g.updateBalances(balances);
      });
    });
  }
}

export default CategoryTree;
