import React, { ReactElement, useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import Group from './Group';
import MobxStore from '../state/mobxStore';
import { useCategoryTransferDialog } from '../CategoryTransferDialog';
import SystemCategory from './SystemCategory';
import { CategoryInterface } from '../state/State';
import Category from './Category';

const CategoryView = (): ReactElement => {
  const { categoryTree, uiState } = useContext(MobxStore);
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();

  const handleCategorySelected = (category: CategoryInterface) => {
    uiState.selectCategory(category);
  };

  useEffect(() => {
    // If there isn't a category selected then select the unassigned category
    if (uiState.selectedCategory === null) {
      uiState.selectCategory(categoryTree.unassignedCat);
    }
  }, [uiState.selectedCategory, categoryTree.unassignedCat, uiState, categoryTree]);

  return (
    <>
      <div style={{ borderBottom: 'thin black solid' }}>
        <SystemCategory category={categoryTree.unassignedCat} />
        <SystemCategory category={categoryTree.fundingPoolCat} />
        <SystemCategory category={categoryTree.accountTransferCat} />
      </div>
      <div id="categories">
        {categoryTree.groups.map((group) => {
          if (group.type === 'REGULAR') {
            return (
              <Group
                key={group.name}
                group={group}
                onCategorySelected={handleCategorySelected}
                selectedCategory={uiState.selectedCategory}
              />
            );
          }

          if (group.type === 'NO GROUP') {
            return group.categories.map((category) => (
              <Category
                key={`${group.id}:${category.id}`}
                group={group}
                category={category}
                onCategorySelected={handleCategorySelected}
                selected={false}
              />
            ))
          }

          return null;
        })}
      </div>
      <CategoryTransferDialog />
    </>
  );
};

export default observer(CategoryView);
