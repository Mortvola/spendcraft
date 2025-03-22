import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import Category, { isCategory } from './Category';
import {
  Error, GroupProps, isErrorResponse,
  CategoryBalanceProps,
  isAddCategoryResponse,
  GroupType,
  CategoryType,
  ApiResponse,
} from '../../common/ResponseTypes';
import {
  CategoryInterface, CategoryParams, GroupInterface, StoreInterface,
} from './Types';

class Group implements GroupInterface {
  @observable
  accessor id: number;

  @observable
  accessor name: string;

  @observable
  accessor type: GroupType;

  @observable
  accessor children: (Group | CategoryInterface)[] = [];

  group: Group | null = null;

  store: StoreInterface;

  constructor(props: GroupProps, store: StoreInterface) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.store = store;
  }

  getFundingPool(): Category {
    if (this.group === null) {
      throw new Error('gropu not set')
    }

    return this.group?.getFundingPool()
  }

  findCategory(categoryId: number): CategoryInterface | null {
    type StackEntry = (Group | CategoryInterface);

    let stack: StackEntry[] = [
      ...this.children,
    ]

    while (stack.length > 0) {
      const node = stack[0]
      stack = stack.slice(1)

      if (isCategory(node)) {
        if (node.id === categoryId) {
          return node
        }

        const subcategory = node.subcategories.find((subcat) => subcat.id === categoryId)

        if (subcategory) {
          return subcategory
        }
      }
      else {
        stack.push(...(node as Group).children)
      }
    }

    return null;
  }

  async addCategory(params: CategoryParams): Promise<null| Error[]> {
    const {
      group, fundingCategories, goalDate, ...p
    } = params;

    const response = await Http.post(`/api/v1/groups/${this.id}/categories`, {
      ...p,
      fundingCategories:
      p.type === CategoryType.Bill
        ? fundingCategories
        : [],
      groupId: this.id,
      goalDate: goalDate?.toISODate(),
    });

    const body = await response.body();

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else if (isAddCategoryResponse(body)) {
      runInAction(() => {
        const category = new Category(body, this.store);

        // Find the position where this new category should be inserted.
        this.insertCategory(category);
      });
    }

    return null;
  }

  insertCategory(category: CategoryInterface): void {
    // Find the position where this new category should be inserted.
    if (this.type === GroupType.NoGroup) {
      this.store.categoryTree.insertNode(category);
    }

    const index = this.children.findIndex((g) => category.name.localeCompare(g.name) < 0);

    if (index === -1) {
      this.children.push(category);
    }
    else {
      this.children = [
        ...this.children.slice(0, index),
        category,
        ...this.children.slice(index),
      ];
    }

    category.group = this;
  }

  async update(value: { name: string, parentGroupId: number | null }): Promise<null | Error[]> {
    const response = await Http.patch<unknown, ApiResponse<GroupProps>>(`/api/v1/groups/${this.id}`, { ...value, hidden: false });

    const body = await response.body();

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        if (body.data !== undefined) {
          this.name = body.data.name;
        }
      });
    }

    return null;
  }

  async delete (): Promise<null | Error[]> {
    const response = await Http.delete(`/api/v1/groups/${this.id}`);

    if (!response.ok) {
      const body = await response.body();

      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        this.store.categoryTree.removeNode(this);
      });
    }

    return null;
  }

  removeCategory(category: CategoryInterface): void {
    if (this.type === GroupType.NoGroup) {
      this.store.categoryTree.removeNode(category);
    }

    const index = this.children.findIndex((c) => c.id === category.id);
    if (index !== -1) {
      this.children.splice(index, 1);
    }
  }
}

export const isGroup = (r: unknown): r is Group => (
  r !== undefined && r !== null
  && (r as Group).id !== undefined
  && (r as Group).name !== undefined
  && (r as Group).children !== undefined
);

export const isCategoriesArray = (r: unknown): r is Category[] => (
  (Array.isArray(r))
  && (r.length === 0 || isCategory((r as Category[])[0]))
);

export default Group;
