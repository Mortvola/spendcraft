import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import Category from './Category';
import Group, { isGroup } from './Group';
import {
  ApiResponse,
  CategoryBalanceProps,
  CategoryProps,
  CategoryType,
  Error, GroupProps, GroupType, isCategoryProps, isErrorResponse,
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

  subcategories: Category[] = [];

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

  getCategoryGroup(categoryId: number): GroupInterface {
    const category = this.getCategory(categoryId)

    if (!category) {
      throw new Error(`Category not found for id: ${categoryId}`)
    }

    if (!category.group) {
      throw new Error(`Category ${categoryId} not assigned to group`)
    }

    return category.group
  }

  getCategory(categoryId: number): CategoryInterface | null {
    if (categoryId === this.accountTransferCat?.id) {
      return this.accountTransferCat
    }

    if (categoryId === this.unassignedCat?.id) {
      return this.unassignedCat
    }

    return this.budget.findCategory(categoryId)
  }

  getGroup(groupId: number): GroupInterface | Group | null {
    type StackEntry = (Group | GroupInterface);

    let stack: StackEntry[] = [
      this.budget,
    ]

    while (stack.length > 0) {
      const node = stack[0]
      stack = stack.slice(1)

      if (node.id === groupId) {
        return node
      }

      stack.push(...node.children.filter((child) => isGroup(child)))
    }

    return null;
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

  insertNode(node: TreeNode, parentGroupId: number | null): void {
    let group: Group | GroupInterface | null = null;

    if (parentGroupId === null || parentGroupId === this.noGroupGroup!.id) {
      group = this.budget
    }
    else {
      group = this.getGroup(parentGroupId)

      if (group === null) {
        throw new Error(`group not found for ${parentGroupId}`)
      }
    }

    group.insertChild(node)
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

        this.subcategories = [];

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

        // Push onto the stack any categories that are in the No Group group.
        stack.push(
          ...data.categories
            .filter((c) => c.groupId === noGroup.id)
            .map((c) => ({
              props: c,
              parent: this.budget,
            })),
        )

        // Push onto the stack any categories that are in the System group.
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

                // case CategoryType.Bill:
                //   this.subcategories.push(node)
                //   node = undefined
                //   break;

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

        // Assign identified subcategories to their categories.
        // Note: a subcategory can be assigned to multiple categories.
        // eslint-disable-next-line no-restricted-syntax
        // for (const subcategory of this.subcategories) {
        //   if (subcategory.fundingCategories.length === 0) {
        //     this.budget.fundingPoolCat?.subcategories.push(subcategory);
        //   }
        //   else {
        //     // eslint-disable-next-line no-restricted-syntax
        //     for (const fundingCategory of subcategory.fundingCategories) {
        //       const parentCategory = this.getCategory(fundingCategory.categoryId)

        //       if (parentCategory) {
        //         parentCategory.subcategories.push(subcategory)
        //       }
        //     }
        //   }
        // }

        this.budget.children.sort((a, b) => a.name.localeCompare(b.name));

        this.initialized = true;

        if (this.store.uiState.selectedCategory === null) {
          this.store.uiState.selectedCategory = this.unassignedCat;
        }
      });
    }
  }

  async addGroup(name: string, parentGroupId: number | null): Promise<null | Error[]> {
    const response = await Http.post<unknown, GroupProps>('/api/v1/groups', { name, parentGroupId });

    const body = await response.body();

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        const group = new Group(body, this.store);
        this.insertNode(group, body.parentGroupId);
      });
    }

    return null;
  }

  updateBalances(balances: CategoryBalanceProps[]): void {
    runInAction(() => {
      // eslint-disable-next-line no-restricted-syntax
      for (const catBalance of balances) {
        const cat = this.getCategory(catBalance.id)

        if (cat) {
          cat.updateBalance(catBalance)
        }
      }
    });
  }
}

export default CategoryTree;
