import React, { ReactElement, useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import Group from './Group';
import MobxStore from '../state/mobxStore';
import Category from '../state/Category';

const CategoryView = (): ReactElement => {
  const { categoryTree, uiState } = useContext(MobxStore);

  const handleCategorySelected = (category: Category) => {
    uiState.selectCategory(category);
  };

  useEffect(() => {
    // If there isn't a category selected then select the unassigned category
    if (uiState.selectedCategory === null) {
      uiState.selectCategory(
        categoryTree.getCategory(categoryTree.systemIds.unassignedId),
      );
    }
  }, [uiState.selectedCategory, categoryTree.systemIds.unassignedId, uiState, categoryTree]);

  return (
    <div id="categories">
      {categoryTree.groups.map((group) => (
        <Group
          key={group.name}
          group={group}
          onCategorySelected={handleCategorySelected}
          selectedCategory={uiState.selectedCategory}
        />
      ))}
    </div>
  );
};

export default observer(CategoryView);
