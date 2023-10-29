import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Outlet } from 'react-router-dom';
import useMediaQuery from '../MediaQuery'
import CategoryView from './CategoryView/CategoryView';
import HomeToolbar from './CategoryView/CategoryViewToolbar';
import { useStores } from '../State/mobxStore';
import styles from './Home.module.css';
import Main from '../Main';
import DesktopView from '../DesktopView';
import MobileView from '../MobileView';

const Home: React.FC = observer(() => {
  const stores = useStores();
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

  const handleTitleClick = () => {
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
              <div className={styles.categories}>
                <CategoryView onCategorySelected={handleCategorySelected} />
              </div>
            )}
            onToggleClick={handleToggleClick}
            className={styles.theme}
          >
            <Outlet />
          </Main>
        </DesktopView>
        <MobileView>
          <div className={styles.categories}>
            <div className={styles.titleWrapper} onClick={handleTitleClick}>
              <div className={`${styles.backButton} ${open ? 'open' : ''}`}>{'<'}</div>
              <div className={`${styles.title} ${open ? 'open' : ''}`}>Categories</div>
            </div>
            <div className={styles.wrapper}>
              <CategoryView onCategorySelected={handleCategorySelected} />
              <div className={`${styles.offCanvas} ${open ? 'open' : ''}`}>
                {/* <div className={styles.offCanvasTitle}>
                  { stores.uiState.selectedCategory?.name }
                </div> */}
                <Outlet />
              </div>
            </div>
          </div>
        </MobileView>
      </>
    );
  }

  return null;
});

export default Home;
