import React, {
  ReactElement, useContext, useEffect, useState,
} from 'react';
import { observer } from 'mobx-react';
import CategorySelectorGroup from './CategorySelectorGroup';
import MobxStore from '../state/mobxStore';
import Group from '../state/Group';
import Category from '../state/Category';

type PropsType = {
  selectedGroup?: Group | null,
  selectedCategory?: Category | null,
  left?: number | null,
  top?: number | null,
  width?: number | null,
  height?: number | null,
  onSelect: (group: Group, category: Category) => void,
  filter?: string | null,
}

// eslint-disable-next-line react/display-name
const CategorySelector = React.forwardRef<HTMLDivElement, PropsType>(({
  selectedGroup = null,
  selectedCategory = null,
  left = null,
  top = null,
  width = null,
  height = null,
  onSelect,
  filter = null,
}: PropsType, forwardRef): ReactElement => {
  const { categoryTree } = useContext(MobxStore);
  const [filteredGroups, setFilteredGroups] = useState<Array<Group> | null>(null);

  useEffect(() => {
    if (filter) {
      const filterCategories = (categories: Array<Category>) => {
        let result = [];

        if (filter !== '') {
          result = categories.filter((c) => c.name.toLowerCase().includes(filter));
        }
        else {
          // No filter. Allow all of the categories.
          result = categories;
        }

        return result;
      };

      const filterGroup = (group: Group, parts: Array<string>) => {
        let categories: Array<Category> = [];

        if (parts.length === 1) {
          // No colon. Filter can be applied to both group and categories.
          if (group.name.toLowerCase().includes(parts[0])) {
            categories = group.categories;
          }
          else {
            categories = filterCategories(group.categories);
          }
        }
        else if (parts.length === 2) {
          // If the group contains the first part of the filter then
          // consider adding the categories
          if (parts[0] === '' || group.name.toLowerCase().includes(parts[0])) {
            categories = filterCategories(group.categories);
          }
        }

        return categories;
      };

      const parts = filter.toLowerCase().split(':');

      const groups: Array<Group> = [];

      categoryTree.groups.forEach((group) => {
        const categories = filterGroup(group, parts);

        if (categories.length > 0) {
          groups.push(new Group({ ...group, categories }));
        }
      });

      setFilteredGroups(groups);
    }
    else {
      setFilteredGroups(categoryTree.groups);
    }
  }, [categoryTree.groups, filter]);

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

  return (
    <div ref={forwardRef} className="drop-down" style={style}>
      {
        filteredGroups && filteredGroups.map((g) => {
          let sel = null;
          if (selectedGroup !== null && selectedCategory !== null
            && selectedGroup.name === g.name) {
            sel = selectedCategory.name;
          }

          return (
            <CategorySelectorGroup
              key={g.id}
              group={g}
              selected={sel}
              onSelected={onSelect}
            />
          );
        })
      }
    </div>
  );
});

export default observer(CategorySelector);
