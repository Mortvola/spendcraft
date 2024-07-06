import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
  Outlet, matchPath, useLocation, useNavigate,
} from 'react-router-dom';
import useMediaQuery from '../MediaQuery'
import CategoryView from './CategoryView/CategoryView';
import HomeToolbar from './CategoryView/CategoryViewToolbar';
import { useStores } from '../State/Store';
import styles from './Home.module.scss';
import Main from '../Main';
import DesktopView from '../DesktopView';
import MobileView from '../MobileView';
import NavigationView from '../NavigationView';

const Home: React.FC = observer(() => {
  const { categoryTree } = useStores();
  const [open, setOpen] = useState<boolean>(false);
  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    const matched = matchPath({ path: '/home/:category', caseSensitive: false, end: true }, location.pathname);

    if (matched) {
      setOpen(true);
    }
    else {
      setOpen(false);
    }
  }, [location.pathname]);

  const handleClose = () => {
    navigate('/home');
  }

  if (categoryTree.initialized) {
    return (
      <>
        <DesktopView>
          <Main
            toolbar={<HomeToolbar open={open} />}
            sidebar={(
              <CategoryView />
            )}
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
            <CategoryView />
          </NavigationView>
        </MobileView>
      </>
    );
  }

  return null;
});

export default Home;
