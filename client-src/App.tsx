import React, { useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { observer } from 'mobx-react-lite';
import 'regenerator-runtime';
import {
  BrowserRouter, Routes, Route, Outlet, useLocation, useNavigate,
} from 'react-router-dom';
import Http, { ServerError, serverError } from '@mortvola/http';
import '@mortvola/usemodal/dist/main.css';
import '@mortvola/forms/dist/main.css';
import { runInAction } from 'mobx';
import Menubar from './Menubar';
import Home from './Categories/Home';
import Accounts from './AccountView/Accounts';
import Reports from './Reports/Reports';
import PlaidLink from './PlaidLink';
import { StoreContext, store, useStores } from './State/Store';
import UserAccount from './UserAccount';
import './style.scss';
import AccountDetails from './AccountView/AccountDetails';
import CategoryDetails from './Categories/CategoryDetails';
import Rebalances from './Categories/Rebalances';
import Signup from './Credentials/Signup';
import Signin from './Credentials/Signin';
import Intro from './Intro';
import RequireAuth from './RequireAuth';
import RecoverPassword from './Credentials/RecoverPassword';
import styles from './App.module.scss';
import DesktopView from './DesktopView';
import MobileView from './MobileView';
import TabView from './TabView/TabView';
import Search from './Search';
import AutoAssigments from './AutoAssignment/AutoAssignments';
import AutoAssignmentDetails from './AutoAssignment/AutoAssignmentDetails';
import TransactionLogs from './TransactionLogs/TransactionLogs';
import TransactionLogDetails from './TransactionLogs/TransactionLogDetails';
import PlaidLogsView from './PlaidLogs/PlaidLogsView';
import PlaidLogs from './PlaidLogs/PlaidLogs';
import Overview from './Overview/Overview';
import OverviewView from './Overview/OverviewView';

const App: React.FC = observer(() => {
  const error = useContext(ServerError);
  const stores = useStores();
  const location = useLocation();
  const navigate = useNavigate();

  Http.unauthorizedHandler = () => {
    if (location.pathname !== '/signin') {
      stores.refresh();
      navigate('/signin');
    }
  };

  if (Http.refreshToken) {
    runInAction(() => {
      stores.user.authenticated = true;

      if (!stores.initialized) {
        stores.user.load();
        stores.categoryTree.load();
        stores.accounts.load();

        stores.initialized = true
      }
    });
  }

  if (error.message) {
    return (
      <div style={{ width: '100%', padding: '1rem' }}>
        <div style={{ paddingBottom: '1rem' }}>
          {error.message}
        </div>
        <div>
          Stack:
          <div style={{ overflowX: 'auto' }}>
            {
              error.stack.map((s) => (
                <div key={s} style={{ paddingLeft: '1rem', whiteSpace: 'nowrap' }}>{s}</div>
              ))
            }
          </div>
        </div>
      </div>
    )
  }

  return (
    <RequireAuth>
      <div className={styles.layout}>
        <DesktopView>
          <Menubar />
          <Outlet />
        </DesktopView>
        <MobileView>
          <Outlet />
          <TabView />
        </MobileView>
        <PlaidLink />
      </div>
    </RequireAuth>
  );
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js');
}

const container = document.querySelector('.app');

if (container) {
  const root = createRoot(container);
  root.render(
    <StoreContext.Provider value={store}>
      <ServerError.Provider value={serverError}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Intro />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/signin" element={<Signin />} />
            <Route path="/recover-password" element={<RecoverPassword />} />
            <Route path="/" element={<App />}>
              <Route path="home" element={<Home />}>
                <Route index element={<CategoryDetails />} />
                <Route path=":categoryId" element={<CategoryDetails />} />
                <Route path="rebalances" element={<Rebalances />} />
              </Route>
              <Route path="accounts" element={<Accounts />}>
                <Route index element={<AccountDetails />} />
                <Route path=":accountId" element={<AccountDetails />} />
              </Route>
              <Route path="search" element={<Search />} />
              <Route path="reports" element={<Reports />} />
              <Route path="auto-assignments" element={<AutoAssigments />}>
                <Route index element={<AutoAssignmentDetails />} />
              </Route>
              <Route path="logs" element={<TransactionLogs />}>
                <Route index element={<TransactionLogDetails />} />
              </Route>
              <Route path="bills" element={<OverviewView />}>
                <Route index element={<Overview />} />
              </Route>
              <Route path="admin" element={<PlaidLogsView />}>
                <Route index element={<PlaidLogs />} />
              </Route>
              <Route path="user" element={<UserAccount />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ServerError.Provider>
    </StoreContext.Provider>,
  );
}
