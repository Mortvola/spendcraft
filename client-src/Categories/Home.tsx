import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Outlet } from 'react-router-dom';
import useMediaQuery from '../MediaQuery'
import CategoryView from './CategoryView/CategoryView';
import HomeToolbar from './CategoryView/CategoryViewToolbar';
import { useStores } from '../State/mobxStore';
import styles from './Home.module.css';
import Main from '../Main';

const Home: React.FC = observer(() => {
  const { categoryTree } = useStores();
  const { isMobile } = useMediaQuery();
  const [open, setOpen] = useState<boolean>(false);

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
        <Outlet />
      </Main>
    );
  }

  return null;
});

export default Home;
