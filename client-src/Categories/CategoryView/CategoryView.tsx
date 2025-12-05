import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  useMatch, useNavigate, useParams, useResolvedPath,
} from 'react-router';
import { useStores } from '../../State/Store';
import { CategoryInterface } from '../../State/Types';
import Group from './Group';
import SystemCategory from './SystemCategory';
import Category from './Category';
import styles from './CategoryView.module.scss'
import useMediaQuery from '../../MediaQuery';
import RemoteDataManager from '../../RemoteDataManager';
import DesktopView from '../../DesktopView';
import MobileView from '../../MobileView';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Institution from './Institution';
import Amount from '../../Amount';
import { TrackingType } from '../../../common/ResponseTypes';

const CategoryView: React.FC = observer(() => {
  const navigate = useNavigate();
  const params = useParams();
  const rebalancesPath = useResolvedPath('rebalances');
  const rebalancesMatch = useMatch({ path: rebalancesPath.pathname, end: true });
  const { categoryTree, accounts, uiState } = useStores();
  const { isMobile } = useMediaQuery();

  const handleCategorySelected = (category: CategoryInterface) => {
    navigate(category.id.toString());
  };

  const handleRebalancesClick = () => {
    navigate('rebalances');
  }

  const handleAccountsToggle = () => {
    uiState.toggleAccountsExpanded()
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

  const getAccountBalanceTotal = () => (
    accounts.institutions.reduce((prev, institution) => {
      const balance = institution.accounts
        .reduce((p, account) => {
          if (!account.closed && account.tracking === TrackingType.Transactions) {
            return p + account.balance + account.pendingBalance
          }

          return p;
        }, 0)

      return prev + balance;
    }, 0)
  )

  const renderAccounts = () => {
    return accounts.institutions.flatMap((institution) => (
      <Institution institution={institution} />
    ))
  }

  const renderCategories = () => (
    <div className={styles.categories}>
      {
        categoryTree.budget.fundingPoolCat?.subcategories
          .filter((subcat) => (!subcat.hidden || uiState.showHidden))
          .map((subcat) => (
            <Category
              key={`${subcat.id}`}
              category={subcat}
              onCategorySelected={handleCategorySelected}
              selectedCategory={uiState.selectedCategory}
            />
          ))
      }
      {
        <Group
          key="budget"
          group={categoryTree.budget}
          onCategorySelected={handleCategorySelected}
          selectedCategory={uiState.selectedCategory}
        />
      }
      <div className={styles.accounts}>
        <div>
          {
            uiState.accountsState
              ? <ChevronDown size={16} strokeWidth={2.5} onClick={handleAccountsToggle} />
              : <ChevronRight size={16} strokeWidth={2.5} onClick={handleAccountsToggle} />
          }
          Accounts
        </div>
        {
          !uiState.accountsState
            ? <Amount amount={getAccountBalanceTotal()} />
            : null
        }
      </div>
      {
        uiState.accountsState
          ? renderAccounts()
          : null
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
