import { makeAutoObservable, runInAction } from 'mobx';
import Category from './Category';
import Group from './Group';
import {
  CategoryBalanceProps,
  Error, isErrorResponse,
  isGroupProps, isGroupsResponse,
} from '../../common/ResponseTypes';
import { CategoryInterface, CategoryTreeInterface, StoreInterface } from './State';
import SystemIds from './SystemIds';
import {
  getBody, httpDelete, httpGet, httpPost,
} from './Transports';

class CategoryTree implements CategoryTreeInterface {
  initialized = false;

  groups: Group[] = [];

  systemIds = new SystemIds();

  noGroupGroup: Group | null = null;

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
        body.forEach((g) => {
          if (g.type !== 'REGULAR') {
            this.systemIds.systemGroupId = g.id;

            g.categories.forEach((c) => {
              switch (c.type) {
                case 'UNASSIGNED':
                  this.unassignedCat = new Category(c, this.store);
                  break;

                case 'FUNDING POOL':
                  this.fundingPoolCat = new Category(c, this.store);
                  break;

                case 'ACCOUNT TRANSFER':
                  this.accountTransferCat = new Category(c, this.store);
                  break;

                default:
                  break;
              }
            })
          }

          const group = new Group(g, this.store);
          this.groups.push(group);
        });

        this.initialized = true;
      });
    }
  }

  async addGroup(name: string): Promise<null | Error[]> {
    const response = await httpPost('/api/groups', { name });

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
