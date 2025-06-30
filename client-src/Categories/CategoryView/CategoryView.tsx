import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  useMatch, useNavigate, useParams, useResolvedPath,
} from 'react-router';
import { useStores } from '../../State/Store';
import { CategoryInterface } from '../../State/Types';
import { isGroup } from '../../State/Group';
import Group from './Group';
import SystemCategory from './SystemCategory';
import Category from './Category';
import styles from './CategoryView.module.scss'
import useMediaQuery from '../../MediaQuery';
import RemoteDataManager from '../../RemoteDataManager';
import DesktopView from '../../DesktopView';
import MobileView from '../../MobileView';
import { GroupType } from '../../../common/ResponseTypes';

const CategoryView: React.FC = observer(() => {
  const navigate = useNavigate();
  const params = useParams();
  const rebalancesPath = useResolvedPath('rebalances');
  const rebalancesMatch = useMatch({ path: rebalancesPath.pathname, end: true });
  const { categoryTree, uiState } = useStores();
  const { isMobile } = useMediaQuery();

  const handleCategorySelected = (category: CategoryInterface) => {
    navigate(category.id.toString());
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
      else if (!isMobile) {
        uiState.selectCategory(categoryTree.unassignedCat);
      }
      else {
        uiState.selectCategory(null);
      }
    }
  }, [categoryTree, isMobile, navigate, params.categoryId, rebalancesMatch, uiState]);

  const renderSystemCategories = () => {
    let rebalancesClassName = 'cat-list-cat system';
    if (rebalancesMatch) {
      rebalancesClassName += ' selected';
    }

    return (
      <div className={styles.system}>
        <SystemCategory category={categoryTree.unassignedCat} onCategorySelected={handleCategorySelected} />
        <SystemCategory category={categoryTree.budget.fundingPoolCat} onCategorySelected={handleCategorySelected} />
        <SystemCategory category={categoryTree.accountTransferCat} onCategorySelected={handleCategorySelected} />
        <div
          className={rebalancesClassName}
          onClick={handleRebalancesClick}
        >
          Category Transfers
        </div>
      </div>
    )
  }

  const renderCategories = () => (
    <div className={styles.categories}>
      {
        categoryTree.budget.fundingPoolCat?.subcategories.map((subcat) => (
          <Category
            key={`${subcat.id}`}
            category={subcat}
            onCategorySelected={handleCategorySelected}
            selectedCategory={uiState.selectedCategory}
          />
        ))
      }
      {
        categoryTree.budget.children.map((group) => {
          if (isGroup(group)) {
            if (group.type === GroupType.Regular) {
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

          if (categoryTree.budget === null) {
            throw new Error('budget is null');
          }

          return (
            <Category
              key={`${group.id}`}
              category={group}
              onCategorySelected={handleCategorySelected}
              selectedCategory={uiState.selectedCategory}
            />
          );
        })
      }
    </div>
  )

  return (
    <>
      <DesktopView>
        <div className={styles.categoriesWrapper}>
          {
            renderSystemCategories()
          }
          <RemoteDataManager data={categoryTree}>
            {
              renderCategories()
            }
          </RemoteDataManager>
        </div>
      </DesktopView>

      <MobileView>
        <RemoteDataManager data={categoryTree} className={styles.categoriesWrapper}>
          {
            renderSystemCategories()
          }
          {
            renderCategories()
          }
        </RemoteDataManager>
      </MobileView>
    </>
  );
});

export default CategoryView;
