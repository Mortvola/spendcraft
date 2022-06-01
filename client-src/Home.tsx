import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import useMediaQuery from './MediaQuery'
import CategoryView from './CategoryView/CategoryView';
import DetailView from './DetailView';
import MobxStore from './State/mobxStore';
import styles from './Home.module.css';
import HomeToolbar from './CategoryView/CategoryViewToolbar';
import Main from './Main';

const Home: React.FC = observer(() => {
  const { uiState, categoryTree } = useContext(MobxStore);
  const { isMobile } = useMediaQuery();
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    if (uiState.selectedCategory) {
      uiState.selectedCategory.getTransactions();
      uiState.selectedCategory.getPendingTransactions();
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
    let title;
    if (uiState.selectedCategory) {
      title = uiState.selectedCategory.name;
    }

    return (
      <Main
        open={open}
        toolbar={<HomeToolbar open={open} />}
        sidebar={(
          <div className={styles.categories}>
            <CategoryView onCategorySelected={handleCategorySelected} />
          </div>
        )}
        onToggleClick={handleToggleClick}
        className={styles.theme}
      >
        <DetailView detailView="Transactions" title={title} type="category" />
      </Main>
    );
  }

  return null;
});

export default Home;
