import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import Category, { isCategory } from './Category';
import {
  Error, GroupProps, isErrorResponse,
  isAddCategoryResponse,
  GroupType,
  CategoryType,
  ApiResponse,
} from '../../common/ResponseTypes';
import {
  CategoryInterface, CategoryParams, GroupInterface, StoreInterface,
} from './Types';
import { TreeNode } from './CategoryTree';

class Group implements GroupInterface {
  @observable
  accessor id: number;

  @observable
  accessor name: string;

  @observable
  accessor type: GroupType;

  @observable
  accessor children: TreeNode[] = [];

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
    type StackEntry = TreeNode;

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
        this.insertChild(category);
      });
    }

    return null;
  }

  insertChild(child: TreeNode): void {
    // Find the position where this new category should be inserted.
    const index = this.children.findIndex((g) => child.name.localeCompare(g.name) < 0);

    if (index === -1) {
      this.children.push(child);
    }
    else {
      this.children = [
        ...this.children.slice(0, index),
        child,
        ...this.children.slice(index),
      ];
    }

    child.group = this;
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
          const nameChanged = this.name !== body.data.name;

          this.name = body.data.name;

          // Has the parent group changed?
          if (body.data.parentGroupId !== this.group?.id || nameChanged) {
            // Remove group from the parent group, if it has one.
            if (this.group) {
              this.group.removeChild(this)
            }

            this.store.categoryTree.insertNode(this, body.data.parentGroupId);
          }
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
        this.group?.removeChild(this);
      });
    }

    return null;
  }

  removeChild(child: TreeNode): void {
    const index = this.children.findIndex((c) => c.id === child.id);
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
