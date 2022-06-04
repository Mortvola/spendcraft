import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import Group from './Group';
import { useStores } from '../State/mobxStore';
import SystemCategory from './SystemCategory';
import { CategoryInterface } from '../State/State';
import Category from './Category';
import { isGroup } from '../State/Group';
import styles from './CategoryView.module.css'

type PropsType = {
  onCategorySelected?: () => void,
}

const CategoryView: React.FC<PropsType> = observer(({
  onCategorySelected,
}) => {
  const { categoryTree, uiState } = useStores();

  const handleCategorySelected = (category: CategoryInterface) => {
    uiState.selectCategory(category);
    if (onCategorySelected) {
      onCategorySelected();
    }
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
        <SystemCategory category={categoryTree.unassignedCat} onCategorySelected={onCategorySelected} />
        <SystemCategory category={categoryTree.fundingPoolCat} onCategorySelected={onCategorySelected} />
        <SystemCategory category={categoryTree.accountTransferCat} onCategorySelected={onCategorySelected} />
      </div>
      <div className={styles.categories}>
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
});

export default CategoryView;
