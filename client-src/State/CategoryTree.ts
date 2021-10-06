import { makeAutoObservable, runInAction } from 'mobx';
import Category, { isCategory } from './Category';
import Group, { isGroup } from './Group';
import {
  CategoryBalanceProps,
  Error, isErrorResponse,
  isGroupProps, isGroupsResponse,
} from '../../common/ResponseTypes';
import {
  CategoryInterface, CategoryTreeInterface, StoreInterface,
} from './State';
import SystemIds from './SystemIds';
import Http from '@mortvola/http';

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

  getCategoryGroup(categoryId: number): Group {
    const group = this.nodes.find((g) => {
      if (isCategory(g)) {
        return false;
      }

      return g.findCategory(categoryId) !== null
    }) ?? (
      this.noGroupGroup && this.noGroupGroup.findCategory(categoryId)
        ? this.noGroupGroup
        : null
    );

    if (isGroup(group)) {
      return group;
    }

    throw new Error('group is null');
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
    const response = await Http.get('/api/groups');

    const body = await response.body();

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
          }
          else {
            this.nodes.push(group);
          }
        });

        this.nodes.sort((a, b) => a.name.localeCompare(b.name));

        this.initialized = true;

        if (this.store.uiState.selectedCategory === null) {
          this.store.uiState.selectedCategory = this.unassignedCat;
        }
      });
    }
  }

  async addGroup(name: string): Promise<null | Error[]> {
    const response = await Http.post('/api/groups', { name });

    const body = await response.body();

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
}

export default CategoryTree;
