import React, { useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import useMediaQuery from './MediaQuery'
import CategoryView from './CategoryView/CategoryView';
import DetailView from './DetailView';
import MobxStore from './State/mobxStore';
import styles from './Home.module.css';

const Home = () => {
  const { uiState, categoryTree } = useContext(MobxStore);
  const { isDesktop, isMobile } = useMediaQuery();

  useEffect(() => {
    if (uiState.selectedCategory) {
      uiState.selectedCategory.getTransactions();
    }
    // register.loadCategoryTransactions(uiState.selectedCategory);
  }, [uiState.selectedCategory]);

  if (categoryTree.initialized) {
    return (
      <>
        {
          isDesktop
            ? (
              <>
                <div className={`${styles.sideBar} window`}>
                  <div className="categories">
                    <CategoryView />
                  </div>
                </div>
                <DetailView detailView="Transactions" />
              </>
            )
            : null
        }
        {
          isMobile
            ? (
              <>
                <DetailView detailView="Transactions" />
              </>
            )
            : null
        }
      </>
    );
  }

  return null;
};

export default observer(Home);
