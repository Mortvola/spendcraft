import React, {
  ReactElement, useContext, useEffect, useState,
} from 'react';
import { observer } from 'mobx-react';
import CategorySelectorGroup from './CategorySelectorGroup';
import MobxStore from '../state/mobxStore';
import Group, { isCategoriesArray, isGroup } from '../state/Group';
import { CategoryInterface, GroupInterface } from '../state/State';
import CategorySelectorCategory from './CategorySelectorCategory';
import { isCategory } from '../state/Category';

type PropsType = {
  selectedCategory?: CategoryInterface | null,
  left?: number | null,
  top?: number | null,
  width?: number | null,
  height?: number | null,
  onSelect: (category: CategoryInterface) => void,
  filter?: string | null,
}

// eslint-disable-next-line react/display-name
const CategorySelector = React.forwardRef<HTMLDivElement, PropsType>(({
  selectedCategory = null,
  left = null,
  top = null,
  width = null,
  height = null,
  onSelect,
  filter = null,
}: PropsType, forwardRef): ReactElement => {
  const { categoryTree } = useContext(MobxStore);
  const [filteredGroups, setFilteredGroups] = useState<(GroupInterface | CategoryInterface)[] | null>(null);

  useEffect(() => {
    if (filter) {
      const filterCategories = (categories: CategoryInterface[], catFilter: string) => {
        let result = [];

        if (catFilter !== '') {
          result = categories.filter((c) => c.name.toLowerCase().includes(catFilter));
        }
        else {
          // No filter. Allow all of the categories.
          result = categories;
        }

        return result;
      };

      const filterGroup = (group: GroupInterface, parts: Array<string>) => {
        let categories: CategoryInterface[] = [];

        if (parts.length === 1) {
          // No colon. Filter can be applied to both group and categories.
          if (group.name.toLowerCase().includes(parts[0])) {
            categories = group.categories;
          }
          else {
            categories = filterCategories(group.categories, parts[0]);
          }
        }
        else if (parts.length === 2) {
          // If the group contains the first part of the filter then
          // consider adding the categories
          if (parts[0] === '' || group.name.toLowerCase().includes(parts[0])) {
            categories = filterCategories(group.categories, parts[1]);
          }
        }

        return categories;
      };

      const parts = filter.toLowerCase().split(':');

      const groups: (GroupInterface)[] = [];

      categoryTree.nodes.forEach((group) => {
        if (isGroup(group)) {
          const categories = filterGroup(group, parts);

          if (categories.length > 0) {
            if (!isCategoriesArray(categories)) {
              throw new Error('categories does not contain categories');
            }

            const grp = new Group(group, group.store);
            grp.setCategories(categories);

            groups.push(grp);
          }
        }
      });

      setFilteredGroups(groups);
    }
    else {
      setFilteredGroups(categoryTree.nodes);
    }
  }, [categoryTree.nodes, filter]);

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
        filteredGroups && filteredGroups.map((g) => {
          if (isGroup(g)) {
            return (
              <CategorySelectorGroup
                key={g.id}
                group={g}
                selected={selectedCategory}
                onSelect={onSelect}
              />
            );
          }

          if (!isCategory(g)) {
            throw new Error('group is not a category');
          }

          return (
            <CategorySelectorCategory
              key={`${g.groupId}:${g.id}`}
              category={g}
              selected={selectedCategory !== null && g.id === selectedCategory.id}
              onSelect={onSelect}
            />
          );
        })
      }
    </div>
  );
});

export default observer(CategorySelector);
