import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Outlet } from 'react-router-dom';
import useMediaQuery from '../MediaQuery'
import CategoryView from './CategoryView/CategoryView';
import HomeToolbar from './CategoryView/CategoryViewToolbar';
import { useStores } from '../State/mobxStore';
import styles from './Home.module.scss';
import Main from '../Main';
import DesktopView from '../DesktopView';
import MobileView from '../MobileView';
import NavigationView from '../NavigationView';

const Home: React.FC = observer(() => {
  const { categoryTree } = useStores();
  const { isMobile } = useMediaQuery();
  const [open, setOpen] = useState<boolean>(false);

  const handleToggleClick = () => {
    setOpen(!open);
  }

  const handleCategorySelected = () => {
    if (isMobile) {
      setOpen(true);
    }
  }

  const handleClose = () => {
    setOpen(false);
  }

  if (categoryTree.initialized) {
    return (
      <>
        <DesktopView>
          <Main
            open={open}
            toolbar={<HomeToolbar open={open} />}
            sidebar={(
              <CategoryView onCategorySelected={handleCategorySelected} />
            )}
            onToggleClick={handleToggleClick}
            className={styles.theme}
          >
            <Outlet />
          </Main>
        </DesktopView>
        <MobileView>
          <NavigationView
            title="Categories"
            open={open}
            onClose={handleClose}
            details={(
              <Outlet />
            )}
          >
            <CategoryView onCategorySelected={handleCategorySelected} />
          </NavigationView>
        </MobileView>
      </>
    );
  }

  return null;
});

export default Home;
