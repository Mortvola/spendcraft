import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Tab, Tabs } from 'react-bootstrap';
import { Outlet } from 'react-router-dom';
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
  const { isMobile } = useMediaQuery();

  const handleToggleClick = () => {
    setOpen(!open);
  }

  const handleAccountSelected = () => {
    if (isMobile) {
      setOpen(true);
    }
  }

  const handleClose = () => {
    setOpen(false);
  }

  return (
    <>
      <DesktopView>
        <Main
          open={open}
          toolbar={<AccountsToolbar open={open} />}
          sidebar={(
            <div className={styles.accounts}>
              <Tabs className="mb-3" mountOnEnter unmountOnExit>
                <Tab eventKey="opened" title="Opened">
                  <AccountView onAccountSelected={handleAccountSelected} opened />
                </Tab>
                <Tab eventKey="closed" title="Closed">
                  <AccountView onAccountSelected={handleAccountSelected} opened={false} />
                </Tab>
              </Tabs>
            </div>
          )}
          onToggleClick={handleToggleClick}
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
                  <AccountView onAccountSelected={handleAccountSelected} opened />
                </Tab>
                <Tab eventKey="closed" title="Closed">
                  <AccountView onAccountSelected={handleAccountSelected} opened={false} />
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
