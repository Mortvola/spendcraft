import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Tab, Tabs } from 'react-bootstrap';
import {
  Outlet, matchPath, useLocation, useNavigate,
} from 'react-router';
import AccountView from './AccountView';
import Main from '../Main';
import AccountsToolbar from './AccountsToolbar';
import styles from './Accounts.module.scss';
import DesktopView from '../DesktopView';
import MobileView from '../MobileView';
import NavigationView from '../NavigationView';
import TabViewMenu from '../TabView/TabViewMenu';
import { EllipsisVertical } from 'lucide-react';
import TabViewMenuItem from '../TabView/TabViewMenuItem';
import { useOfflineAccountDialog } from './OfflineAccountDialog';
import { useStores } from '../State/Store';

const Accounts: React.FC = observer(() => {
  const { accounts } = useStores()
  const [open, setOpen] = useState<boolean>(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [OfflineAccountDialog, showOfflineAccountDialog] = useOfflineAccountDialog();

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

  const handleAddInstitution = () => {
    accounts.linkInstitution();
  };

  const renderMenu = () => (
    <TabViewMenu
      icon={<EllipsisVertical size={24} strokeWidth={1} />}
    >
      <TabViewMenuItem onClick={handleAddInstitution}>Add Online Institution</TabViewMenuItem>
      <TabViewMenuItem onClick={showOfflineAccountDialog}>Add Offline Institution</TabViewMenuItem>
    </TabViewMenu>
  )

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
        <NavigationView
          title="Accounts"
          open={open}
          onClose={handleClose}
          details={<Outlet />}
          menu={open ? undefined : renderMenu() }
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
          <OfflineAccountDialog />
        </NavigationView>
      </MobileView>
    </>
  );
});

export default Accounts;
