import React, { ReactElement, useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import Group from './Group';
import MobxStore from '../state/mobxStore';
import Category from '../state/Category';
import Amount from '../Amount';
import IconButton from '../IconButton';
import { useCategoryTransferDialog } from '../CategoryTransferDialog';
import SystemCategory from './SystemCategory';

const CategoryView = (): ReactElement => {
  const { categoryTree, uiState } = useContext(MobxStore);
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();

  const handleCategorySelected = (category: Category) => {
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
      <div style={{ borderBottom: "thin black solid" }}>
        <SystemCategory category={categoryTree.unassignedCat} />
        <SystemCategory category={categoryTree.fundingPoolCat} />
        <SystemCategory category={categoryTree.accountTransferCat} />
      </div>
      <div id="categories">
        {categoryTree.groups.map((group) => {          
          if (!group.system) {
            return (
              <Group
                key={group.name}
                group={group}
                onCategorySelected={handleCategorySelected}
                selectedCategory={uiState.selectedCategory}
              />
            );
          }

          return null;
        })}
      </div>
      <CategoryTransferDialog />
    </>
  );
};

export default observer(CategoryView);
