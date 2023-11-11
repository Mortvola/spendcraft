import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Tab, Tabs } from 'react-bootstrap';
import {
  Outlet, matchPath, useLocation, useNavigate,
} from 'react-router-dom';
import useMediaQuery from '../MediaQuery'
import AccountView from './AccountView';
import Main from '../Main';
import AccountsToolbar from './AccountsToolbar';
import styles from './Accounts.module.scss';
import DesktopView from '../DesktopView';
import MobileView from '../MobileView';
import NavigationView from '../NavigationView';

const Accounts: React.FC = observer(() => {
  const [open, setOpen] = useState<boolean>(false);
  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    const matched = matchPath({ path: '/accounts/:accountId', caseSensitive: false, end: true }, location.pathname);

    if (matched) {
      setOpen(true);
    }
    else {
      setOpen(false);
    }
  }, [location.pathname]);

  const handleClose = () => {
    navigate('/accounts')
  }

  return (
    <>
      <DesktopView>
        <Main
          toolbar={<AccountsToolbar open={open} />}
          sidebar={(
            <div className={styles.accounts}>
              <Tabs className="mb-3" mountOnEnter unmountOnExit>
                <Tab eventKey="opened" title="Opened">
                  <AccountView opened />
                </Tab>
                <Tab eventKey="closed" title="Closed">
                  <AccountView opened={false} />
                </Tab>
              </Tabs>
            </div>
          )}
          className={styles.theme}
        >
          <Outlet />
        </Main>

      </DesktopView>
      <MobileView>
        <MobileView>
          <NavigationView
            title="Accounts"
            open={open}
            onClose={handleClose}
            details={(
              <Outlet />
            )}
          >
            <div className={styles.accounts}>
              <Tabs className="mb-3" mountOnEnter unmountOnExit>
                <Tab eventKey="opened" title="Opened">
                  <AccountView opened />
                </Tab>
                <Tab eventKey="closed" title="Closed">
                  <AccountView opened={false} />
                </Tab>
              </Tabs>
            </div>
          </NavigationView>
        </MobileView>
      </MobileView>
    </>
  );
});

export default Accounts;
