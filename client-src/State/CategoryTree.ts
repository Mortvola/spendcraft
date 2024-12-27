import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import Category, { isCategory } from './Category';
import Group, { isGroup } from './Group';
import {
  ApiResponse,
  CategoryBalanceProps,
  CategoryProps,
  CategoryType,
  Error, GroupProps, GroupType, isCategoryProps, isErrorResponse,
  isGroupProps,
} from '../../common/ResponseTypes';
import {
  CategoryInterface, CategoryTreeInterface, GroupInterface, RebalancesInterface, StoreInterface,
} from './Types';
import SystemIds from './SystemIds';
import Budget from './Budget';

export type TreeNode = (Category | Group);

class CategoryTree implements CategoryTreeInterface {
  initialized = false;

  budget: Budget;

  systemIds = new SystemIds();

  noGroupGroup: Group | null = null;

  unassignedCat: Category | null = null;

  accountTransferCat: Category | null = null;

  rebalances: RebalancesInterface | null = null;

  store: StoreInterface;

  constructor(store: StoreInterface) {
    this.budget = new Budget(
      {
        id: -1,
        type: GroupType.System,
        name: 'Root',
        parentGroupId: null,
      },
      store,
    )

    makeAutoObservable(this);

    this.store = store;
  }

  // eslint-disable-next-line class-methods-use-this
  state(): 'IDLE' | 'LOADING' | 'LOADING-MORE' {
    return 'IDLE';
  }

  async getData(_id: number) {
    return this.load();
  }

  // eslint-disable-next-line class-methods-use-this
  async getMoreData() {
    console.log('not implemented')
  }

  // eslint-disable-next-line class-methods-use-this
  isComplete() {
    return true;
  }

  getCategoryGroup(categoryId: number): Group {
    const group = this.budget.children.find((g) => {
      if (isCategory(g)) {
        return false;
      }

      return (g as Group).findCategory(categoryId) !== null
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

    if (categoryId === this.accountTransferCat?.id) {
      category = this.accountTransferCat
    }
    else if (categoryId === this.budget.fundingPoolCat?.id) {
      category = this.budget.fundingPoolCat
    }
    else if (categoryId === this.unassignedCat?.id) {
      category = this.unassignedCat
    }
    else {
      this.budget.children.find((node) => {
        if (isCategory(node)) {
          if (node.id === categoryId) {
            category = node;
            return true;
          }
        }
        else {
          const cat = (node as Group).findCategory(categoryId);

          if (cat) {
            category = cat;
            return true;
          }
        }

        return false;
      });
    }

    return category;
  }

  getCategoryName(categoryId: number): string | null {
    let categoryName: string | null = null;

    if (categoryId === this.accountTransferCat?.id) {
      categoryName = this.accountTransferCat.name
    }
    else if (categoryId === this.budget.fundingPoolCat?.id) {
      categoryName = this.budget.fundingPoolCat.name
    }
    else if (categoryId === this.unassignedCat?.id) {
      categoryName = this.unassignedCat.name
    }
    else {
      const category = this.getCategory(categoryId)

      if (category === null) {
        throw new Error(`Category not found: ${categoryId}`)
      }

      categoryName = category.name

      let { group } = category;

      while (group && group.type !== GroupType.System) {
        categoryName = `${group.name}:${categoryName}`
        group = group.group;
      }
    }

    return categoryName;
  }

  insertNode(node: TreeNode): void {
    // Find the position where this new node should be inserted.
    const index = this.budget.children.findIndex((n) => (node.name.localeCompare(n.name) < 0));

    if (index === -1) {
      this.budget.children.push(node);
    }
    else {
      this.budget.children = [
        ...this.budget.children.slice(0, index),
        node,
        ...this.budget.children.slice(index),
      ];
    }
  }

  async load(): Promise<void> {
    const response = await Http.get<ApiResponse<{ groups: GroupProps[], categories: CategoryProps[] }>>(
      '/api/v1/groups',
    );

    const { data } = await response.body();

    if (data) {
      runInAction(() => {
        // Find the 'No Group' group first
        const noGroup = data.groups.find((g) => g.type === GroupType.NoGroup)
        const systemGroup = data.groups.find((g) => g.type === GroupType.System)

        if (noGroup === undefined) {
          throw new Error('No Group group not found')
        }

        if (systemGroup === undefined) {
          throw new Error('System group not found')
        }

        this.systemIds.systemGroupId = systemGroup.id;

        this.budget = new Budget(systemGroup, this.store)

        this.noGroupGroup = new Group(noGroup, this.store)

        type StackEntry = {
          props: GroupProps | CategoryProps,
          parent: Group | null
        }

        let stack: StackEntry[] = data.groups
          .filter((g) => (
            (g.parentGroupId === null || g.parentGroupId === noGroup.id) && g.type !== GroupType.NoGroup
          ))
          .map((g) => ({
            props: g,
            parent: this.budget,
          }))

        stack.push(
          ...data.categories
            .filter((c) => c.groupId === noGroup.id)
            .map((c) => ({
              props: c,
              parent: this.budget,
            })),
        )

        stack.push(
          ...data.categories
            .filter((c) => c.groupId === systemGroup.id)
            .map((c) => ({
              props: c,
              parent: this.budget,
            })),
        )

        while (stack.length > 0) {
          const { props, parent } = stack[0]
          stack = stack.slice(1);

          let node: Group | Category | undefined

          if (isCategoryProps(props)) {
            node = new Category(props, this.store)

            switch (props.type) {
              case CategoryType.Unassigned:
                this.unassignedCat = node;
                node = undefined
                break;

              case CategoryType.FundingPool:
                this.budget.fundingPoolCat = node;
                this.budget.fundingPoolCat.group = this.budget;

                node = undefined
                break;

              case CategoryType.AccountTransfer:
                this.accountTransferCat = node;
                node = undefined
                break;

              default:
                break;
            }
          }
          else if (props.type !== GroupType.System) {
            node = new Group(props, this.store);

            stack.push(
              ...data.groups
                .filter((g) => g.parentGroupId === node!.id)
                .map((g) => ({
                  props: g,
                  parent: node as Group,
                })),
              ...data.categories
                .filter((c) => c.groupId === node!.id)
                .map((c) => ({
                  props: c,
                  parent: node as Group,
                })),
            )
          }

          if (node) {
            if (!parent) {
              throw new Error('parent not set')
            }

            node.group = parent;
            parent.children.push(node)
            parent.children.sort((a, b) => a.name.localeCompare(b.name));
          }
        }

        this.budget.children.sort((a, b) => a.name.localeCompare(b.name));

        this.initialized = true;

        if (this.store.uiState.selectedCategory === null) {
          this.store.uiState.selectedCategory = this.unassignedCat;
        }
      });
    }
  }

  async addGroup(name: string): Promise<null | Error[]> {
    const response = await Http.post('/api/v1/groups', { name });

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
    const index = this.budget.children.findIndex((n) => n.id === node.id);

    if (index !== -1) {
      this.budget.children.splice(index, 1);
    }
  }

  updateBalances(balances: CategoryBalanceProps[]): void {
    runInAction(() => {
      this.budget.children.forEach((node) => {
        node.updateBalances(balances);
      });
    });
  }
}

export default CategoryTree;
