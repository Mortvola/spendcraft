import { makeAutoObservable, runInAction } from 'mobx';
import Category, { isCategory } from './Category';
import Group, { isGroup } from './Group';
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

  nodes: (Category | Group)[] = [];

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

  getCategoryGroup(categoryId: number): Group | null {
    const group = this.nodes.find((g) => {
      if (isCategory(g)) {
        return false;
      }

      return g.categories.some((c) => (c.id === categoryId))
    });

    if (isGroup(group)) {
      return group;
    }

    return null;
  }

  getCategory(categoryId: number): CategoryInterface | null {
    let category: Category | null = null;

    this.nodes.find((node) => {
      if (isCategory(node)) {
        if (node.id === categoryId) {
          category = node;
          return true;
        }
      }
      else {
        const cat = node.findCategory(categoryId);

        if (cat) {
          category = cat;
          return true;
        }
      }

      return false;
    });

    return category;
  }

  getCategoryName(categoryId: number): string | null {
    let categoryName = null;

    this.nodes.find((node) => {
      if (isGroup(node)) {
        const category = node.findCategory(categoryId);

        if (category) {
          categoryName = `${node.name}:${category.name}`;
          return true;
        }
      }
      else if (node.id === categoryId) {
        categoryName = node.name;
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

          if (g.type === 'NO GROUP') {
            g.categories.forEach((c) => {
              const category = new Category(c, this.store);
              this.nodes.push(category);
            })
          }
          else {
            const group = new Group(g, this.store);
            this.nodes.push(group);
          }
        });

        this.nodes.sort((a, b) => a.name.localeCompare(b.name));

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
          const index = this.nodes.findIndex(
            (g) => body.name.toLowerCase().localeCompare(g.name.toLowerCase()) < 0,
          );

          if (index === -1) {
            this.nodes.push(new Group(body, this.store));
          }
          else {
            this.nodes = [
              ...this.nodes.slice(0, index),
              new Group(body, this.store),
              ...this.nodes.slice(index),
            ];
          }
        }
      });
    }

    return null;
  }

  async deleteGroup(id: number): Promise<null | Array<Error>> {
    const index = this.nodes.findIndex((g) => g.id === id);

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
          this.nodes.splice(index, 1);
        });
      }
    }

    return null;
  }

  updateBalances(balances: CategoryBalanceProps[]): void {
    runInAction(() => {
      this.nodes.forEach((node) => {
        node.updateBalances(balances);
      });
    });
  }
}

export default CategoryTree;
