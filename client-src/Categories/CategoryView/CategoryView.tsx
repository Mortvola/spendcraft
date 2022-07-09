import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  useMatch, useNavigate, useParams, useResolvedPath,
} from 'react-router-dom';
import { useStores } from '../../State/mobxStore';
import { CategoryInterface } from '../../State/State';
import { isGroup } from '../../State/Group';
import Group from './Group';
import SystemCategory from './SystemCategory';
import Category from './Category';
import styles from './CategoryView.module.css'

type PropsType = {
  onCategorySelected: () => void,
}

const CategoryView: React.FC<PropsType> = observer(({
  onCategorySelected,
}) => {
  const navigate = useNavigate();
  const params = useParams();
  const rebalancesPath = useResolvedPath('rebalances');
  const rebalancesMatch = useMatch({ path: rebalancesPath.pathname, end: true });
  const { categoryTree, uiState } = useStores();

  const handleCategorySelected = (category: CategoryInterface) => {
    if (category === categoryTree.unassignedCat) {
      navigate('');
    }
    else {
      navigate(category.id.toString());
    }

    uiState.selectCategory(category);
    onCategorySelected();
  };

  const handleRebalancesClick = () => {
    navigate('rebalances');
  }

  React.useEffect(() => {
    if (categoryTree.initialized) {
      if (params.categoryId !== undefined) {
        const category = categoryTree.getCategory(parseInt(params.categoryId, 10));

        if (category) {
          uiState.selectCategory(category);
        }
        else {
          // category wasn't found for the categoryId. Navigate back home.
          navigate('');
        }
      }
      else if (rebalancesMatch) {
        uiState.selectCategory(null);
      }
      else {
        uiState.selectCategory(categoryTree.unassignedCat);
      }
    }
  }, [categoryTree, navigate, params.categoryId, rebalancesMatch, uiState]);

  let rebalancesClassName = 'cat-list-cat system';
  if (rebalancesMatch) {
    rebalancesClassName += ' selected';
  }

  return (
    <>
      <div style={{ borderBottom: 'thin black solid' }}>
        <SystemCategory category={categoryTree.unassignedCat} onCategorySelected={handleCategorySelected} />
        <SystemCategory category={categoryTree.fundingPoolCat} onCategorySelected={handleCategorySelected} />
        <SystemCategory category={categoryTree.accountTransferCat} onCategorySelected={handleCategorySelected} />
        <div
          className={rebalancesClassName}
          onClick={handleRebalancesClick}
        >
          Rebalances
        </div>
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
