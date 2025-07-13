import React from 'react';
import { observer } from 'mobx-react';
import CategorySelectorGroup from './CategorySelectorGroup';
import { useStores } from '../State/Store';
import { isGroup } from '../State/Group';
import { CategoryInterface, GroupInterface } from '../State/Types';
import CategorySelectorCategory from './CategorySelectorCategory';
import { isCategory } from '../State/Category';
import { CategoryType } from '../../common/ResponseTypes';

export const categoryFiltered = (
  group: GroupInterface | null,
  category: GroupInterface | CategoryInterface,
  filterParts: string[],
  types?: CategoryType[],
): boolean => {
  if (types !== undefined && isCategory(category) && !types.includes(category.type)) {
    return true
  }

  if (filterParts.length > 0) {
    if (filterParts.length === 1) {
      // No colon. Filter can be applied to both group and categories.

      // If the category's group matches the filter then always include the
      // category.
      return ((group === null || !group.name.toLowerCase().includes(filterParts[0]))
       && !category.name.toLowerCase().includes(filterParts[0]));
    }

    if (filterParts[0] === '') {
      // filter only applies to the category
      return !category.name.toLowerCase().includes(filterParts[1]);
    }

    if (filterParts[1] === '') {
      // filter only applies to the group
      return group === null || !group.name.toLowerCase().includes(filterParts[0]);
    }

    return (group === null || !group.name.toLowerCase().includes(filterParts[0]))
      || !category.name.toLowerCase().includes(filterParts[1]);
  }

  return false;
};

interface PropsType {
  selectedCategory?: CategoryInterface | null,
  left?: number | null,
  top?: number | null,
  width?: number | null,
  height?: number | null,
  onSelect: (category: CategoryInterface) => void,
  filter?: string[],
  types?: CategoryType[],
}

const CategorySelector = observer(React.forwardRef<HTMLDivElement, PropsType>(({
  selectedCategory = null,
  left = null,
  top = null,
  width = null,
  height = null,
  onSelect,
  filter = [],
  types,
}, forwardRef) => {
  const { categoryTree } = useStores();

  const filteredCategories = (group: GroupInterface, level: number) => (
    group.children
      .filter((c) => (
        !categoryFiltered(group, c, filter, types)
      ))
      .map((c) => {
        if (isCategory(c)) {
          return (
            <CategorySelectorCategory
              key={`${group.id}:${c.id}`}
              category={c}
              selected={selectedCategory !== null && c.id === selectedCategory.id}
              onSelect={onSelect}
              level={level}
            />
          )
        }

        if (isGroup(c)) {
          return (
            <CategorySelectorGroup
              key={c.id}
              group={c}
              level={level}
            >
              {filteredCategories(c, level + 1)}
            </CategorySelectorGroup>
          );
        }

        return null
      })
  )

  const style: Record<string, unknown> = {}; // { display: 'none' };
  if (left !== null) {
    style.left = left;
  }

  if (top !== null) {
    style.top = top;
  }

  if (width !== null) {
    style.width = width;
  }

  if (height !== null) {
    style.height = height;
  }

  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  return (
    <div
      ref={forwardRef}
      className="drop-down"
      style={style}
      onMouseDown={handleMouseDown}
    >
      {
        // Unassigned
        categoryTree.unassignedCat && !categoryFiltered(null, categoryTree.unassignedCat, filter, types)
          ? (
            <CategorySelectorCategory
              key={`${categoryTree.budget.id}:${categoryTree.unassignedCat.id}`}
              category={categoryTree.unassignedCat}
              selected={selectedCategory !== null && categoryTree.unassignedCat.id === selectedCategory.id}
              onSelect={onSelect}
              level={0}
            />
          )
          : null
      }
      {
        // Funding Pool
        categoryTree.budget.fundingPoolCat && !categoryFiltered(null, categoryTree.budget.fundingPoolCat, filter, types)
          ? (
            <CategorySelectorCategory
              key={`${categoryTree.budget.id}:${categoryTree.budget.fundingPoolCat.id}`}
              category={categoryTree.budget.fundingPoolCat}
              selected={selectedCategory !== null && categoryTree.budget.fundingPoolCat.id === selectedCategory.id}
              onSelect={onSelect}
              level={0}
            />
          )
          : null
      }
      {
        // Account Transfer
        categoryTree.accountTransferCat && !categoryFiltered(null, categoryTree.accountTransferCat, filter, types)
          ? (
            <CategorySelectorCategory
              key={`${categoryTree.budget.id}:${categoryTree.accountTransferCat.id}`}
              category={categoryTree.accountTransferCat}
              selected={selectedCategory !== null && categoryTree.accountTransferCat.id === selectedCategory.id}
              onSelect={onSelect}
              level={0}
            />
          )
          : null
      }
      {
        categoryTree.budget.children.map((g) => {
          if (isGroup(g)) {
            const categories = filteredCategories(g, 1);
            if (categories.length > 0) {
              return (
                <CategorySelectorGroup
                  key={g.id}
                  group={g}
                  level={0}
                >
                  {filteredCategories(g, 1)}
                </CategorySelectorGroup>
              );
            }

            return null;
          }

          if (!isCategory(g)) {
            throw new Error('group is not a category');
          }

          if (!categoryFiltered(null, g, filter, types)) {
            if (g.group === null) {
              throw new Error('group is null')
            }

            return (
              <CategorySelectorCategory
                key={`${g.group.id}:${g.id}`}
                category={g}
                selected={selectedCategory !== null && g.id === selectedCategory.id}
                onSelect={onSelect}
                level={0}
              />
            );
          }

          return null;
        })
      }
    </div>
  );
}));

export default CategorySelector;
