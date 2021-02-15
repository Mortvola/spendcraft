import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import PropTypes from 'prop-types';
import CategorySelectorGroup from './CategorySelectorGroup';
import MobxStore from '../redux/mobxStore';

// eslint-disable-next-line react/display-name
const CategorySelector = ({
  selectedGroup,
  selectedCategory,
  left,
  top,
  width,
  height,
  onSelect,
  filter,
}, forwardRef) => {
  const { categoryTree } = useContext(MobxStore);
  const [filteredGroups, setFilteredGroups] = useState(null);

  useEffect(() => {
    if (filter) {
      const filterCategories = (categories) => {
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

      const filterGroup = (group, parts) => {
        let categories = [];

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

      const groups = [];

      categoryTree.groups.forEach((group) => {
        const categories = filterGroup(group, parts);

        if (categories.length > 0) {
          groups.push({ ...group, categories });
        }
      });

      setFilteredGroups(groups);
    }
    else {
      setFilteredGroups(categoryTree.groups);
    }
  }, [categoryTree.groups, filter]);

  let style = { display: 'none' };
  style = {
    left, top, width, height,
  };

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
};

CategorySelector.propTypes = {
  left: PropTypes.number,
  top: PropTypes.number,
  width: PropTypes.number,
  height: PropTypes.number,
  onSelect: PropTypes.func,
  selectedGroup: PropTypes.shape(),
  selectedCategory: PropTypes.shape(),
  filter: PropTypes.string,
};

CategorySelector.defaultProps = {
  left: null,
  top: null,
  width: null,
  height: null,
  onSelect: null,
  selectedGroup: null,
  selectedCategory: null,
  filter: null,
};

export default observer(CategorySelector, { forwardRef: true });
