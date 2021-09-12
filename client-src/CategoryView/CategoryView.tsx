import React, { ReactElement, useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import Group from './Group';
import MobxStore from '../state/mobxStore';
import SystemCategory from './SystemCategory';
import { CategoryInterface } from '../state/State';
import Category from './Category';
import { isGroup } from '../state/Group';

const CategoryView = (): ReactElement => {
  const { categoryTree, uiState } = useContext(MobxStore);

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
        {categoryTree.nodes.map((group) => {
          if (isGroup(group)) {
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

            return null;
          }

          if (categoryTree.noGroupGroup === null) {
            throw new Error('no group is null');
          }

          return (
            <Category
              key={`${group.id}`}
              category={group}
              group={categoryTree.noGroupGroup}
              onCategorySelected={handleCategorySelected}
              selected={uiState.selectedCategory === group}
            />
          );
        })}
      </div>
    </>
  );
};

export default observer(CategoryView);
