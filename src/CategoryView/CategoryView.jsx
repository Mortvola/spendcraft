import React, { useContext } from 'react';
import { observer } from 'mobx-react-lite';
import Group from './Group';
import MobxStore from '../redux/mobxStore';

const CategoryView = () => {
  const { categoryTree, register } = useContext(MobxStore);

  const handleCategorySelected = (categoryId) => {
    categoryTree.selectCategory(categoryId);
  };

  return (
    <div id="categories">
      {categoryTree.groups.map((group) => (
        <Group
          key={group.name}
          group={group}
          onCategorySelected={handleCategorySelected}
          categorySelected={categoryTree.selectedCategory}
        />
      ))}
    </div>
  );
};

export default observer(CategoryView);
