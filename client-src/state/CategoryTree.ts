import { makeAutoObservable, runInAction } from 'mobx';
import Category, { isCategory } from './Category';
import Group, { isGroup } from './Group';
import {
  CategoryBalanceProps,
  Error, isAddCategoryResponse, isErrorResponse,
  isGroupProps, isGroupsResponse,
} from '../../common/ResponseTypes';
import {
  CategoryInterface, CategoryTreeInterface, StoreInterface,
} from './State';
import SystemIds from './SystemIds';
import {
  getBody, httpGet, httpPost,
} from './Transports';

export type TreeNode = (Category | Group);

class CategoryTree implements CategoryTreeInterface {
  initialized = false;

  nodes: TreeNode[] = [];

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
    let category: CategoryInterface | null = null;

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

  insertNode(node: TreeNode): void {
    // Find the position where this new node should be inserted.
    const index = this.nodes.findIndex((n) => (node.name.localeCompare(n.name) < 0));

    if (index === -1) {
      this.nodes.push(node);
    }
    else {
      this.nodes = [
        ...this.nodes.slice(0, index),
        node,
        ...this.nodes.slice(index),
      ];
    }
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
          if (group.type === 'NO GROUP') {
            this.noGroupGroup = group;
            group.categories.forEach((c) => {
              this.nodes.push(c);
            })
          }
          else {
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
          const group = new Group(body, this.store);
          this.insertNode(group);
        }
      });
    }

    return null;
  }

  removeNode(node: TreeNode): void {
    const index = this.nodes.findIndex((n) => n.id === node.id);

    if (index !== -1) {
      this.nodes.splice(index, 1);
    }
  }

  updateBalances(balances: CategoryBalanceProps[]): void {
    runInAction(() => {
      this.nodes.forEach((node) => {
        node.updateBalances(balances);
      });
    });
  }

  async addCategory(name: string, group: Group): Promise<null| Error[]> {
    const response = await httpPost(`/api/groups/${group.id}/categories`, { groupId: group.id, name });

    const body = await getBody(response);

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else if (isAddCategoryResponse(body)) {
      runInAction(() => {
        const category = new Category(body, this.store);

        // Find the position where this new category should be inserted.
        if (group === this.noGroupGroup) {
          this.insertNode(category);
        }
        else {
          group.insertCategory(category);
        }
      });
    }

    return null;
  }

  removeCategory(category: CategoryInterface): void {
    const index = this.nodes.findIndex((g) => g.id === category.id);

    if (index !== -1) {
      this.nodes.splice(index, 1);
    }
    else {
      const group = this.getCategoryGroup(category.id);

      if (group) {
        group.removeCategory(category);
      }
    }
  }
}

export default CategoryTree;
