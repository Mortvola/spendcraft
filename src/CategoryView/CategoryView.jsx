import React, { useContext } from 'react';
import { observer } from 'mobx-react-lite';
import Group from './Group';
import MobxStore from '../redux/mobxStore';

const CategoryView = () => {
  const { categoryTree, uiState } = useContext(MobxStore);

  const handleCategorySelected = (categoryId) => {
    uiState.selectCategory(categoryId);
  };

  // If there isn't a category selected then select the unassigned category
  if (uiState.selectedCategoryId === null) {
    uiState.selectedCategoryId = categoryTree.systemIds.unassignedId;
  }

  return (
    <div id="categories">
      {categoryTree.groups.map((group) => (
        <Group
          key={group.name}
          group={group}
          onCategorySelected={handleCategorySelected}
          selectedCategoryId={uiState.selectedCategoryId}
        />
      ))}
    </div>
  );
};

export default observer(CategoryView);
