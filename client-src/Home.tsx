import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import useMediaQuery from './MediaQuery'
import CategoryView from './CategoryView/CategoryView';
import DetailView from './DetailView';
import MobxStore from './State/mobxStore';
import styles from './Home.module.css';
import HomeToolbar from './CategoryView/CategoryViewToolbar';
import Main from './Main';
import Sidebar from './Sidebar';

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
    if (isMobile) {
      setOpen(false);
    }
  }

  if (categoryTree.initialized) {
    return (
      <Main toolbar={<HomeToolbar open={open} />} onToggleClick={handleToggleClick} className={styles.theme}>
        <Sidebar open={open} className={styles.theme}>
          <div className={styles.categories}>
            <CategoryView onCategorySelected={handleCategorySelected} />
          </div>
        </Sidebar>
        <DetailView detailView="Transactions" />
      </Main>
    );
  }

  return null;
};

export default observer(Home);
