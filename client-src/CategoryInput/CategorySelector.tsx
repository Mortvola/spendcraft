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
  category: CategoryInterface,
  filterParts: string[],
  types?: CategoryType[],
): boolean => {
  if (types !== undefined && !types.includes(category.type)) {
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

type PropsType = {
  selectedCategory?: CategoryInterface | null,
  left?: number | null,
  top?: number | null,
  width?: number | null,
  height?: number | null,
  onSelect: (category: CategoryInterface) => void,
  filter?: string[],
  types?: CategoryType[],
}

// eslint-disable-next-line react/display-name
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

  const filteredCategories = (group: GroupInterface) => (
    group.categories
      .filter((c) => (
        !categoryFiltered(group, c, filter, types)
      ))
      .map((c) => (
        <CategorySelectorCategory
          key={`${group.id}:${c.id}`}
          category={c}
          selected={selectedCategory !== null && c.id === selectedCategory.id}
          onSelect={onSelect}
        />
      ))
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
        categoryTree.nodes.map((g) => {
          if (isGroup(g)) {
            const categories = filteredCategories(g);
            if (categories.length > 0) {
              return (
                <CategorySelectorGroup
                  key={g.id}
                  group={g}
                >
                  {filteredCategories(g)}
                </CategorySelectorGroup>
              );
            }

            return null;
          }

          if (!isCategory(g)) {
            throw new Error('group is not a category');
          }

          if (!categoryFiltered(null, g, filter, types)) {
            return (
              <CategorySelectorCategory
                key={`${g.groupId}:${g.id}`}
                category={g}
                selected={selectedCategory !== null && g.id === selectedCategory.id}
                onSelect={onSelect}
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
