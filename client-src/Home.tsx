import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import useMediaQuery from './MediaQuery'
import CategoryView from './CategoryView/CategoryView';
import DetailView from './DetailView';
import MobxStore from './State/mobxStore';
import styles from './Home.module.css';
import HomeToolbar from './CategoryView/CategoryViewToolbar';
import Main from './Main';

const Home = () => {
  const { uiState, categoryTree } = useContext(MobxStore);
  const { isMobile } = useMediaQuery();
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    if (uiState.selectedCategory) {
      uiState.selectedCategory.getTransactions();
    }
  }, [uiState.selectedCategory]);

  const handleToggleClick = () => {
    setOpen(!open);
  }

  const handleCategorySelected = () => {
    setOpen(false);
  }

  if (categoryTree.initialized) {
    return (
      <Main toolbar={<HomeToolbar onToggleClick={handleToggleClick} open={open} />} className={styles.home}>
        {
          isMobile
            ? (
              <>
                <div className={`mobile ${styles.sideBar}`} style={{ transform: `translateX(${open ? 0 : '-100%'})` }}>
                  <div className={styles.categories}>
                    <CategoryView onCategorySelected={handleCategorySelected} />
                  </div>
                </div>
              </>
            )
            : (
              <>
                <div className={`${styles.sideBar} window`}>
                  <div className={styles.categories}>
                    <CategoryView />
                  </div>
                </div>
              </>
            )
        }
        <DetailView detailView="Transactions" />
      </Main>
    );
  }

  return null;
};

export default observer(Home);
