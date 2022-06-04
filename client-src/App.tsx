import React, { ReactNode, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { observer } from 'mobx-react-lite';
import 'regenerator-runtime';
import {
  BrowserRouter, Routes, Route, Outlet, useRoutes, createRoutesFromChildren,
} from 'react-router-dom';
import { ServerError, serverError } from '@mortvola/http';
import '@mortvola/usemodal/dist/main.css';
import '@mortvola/forms/dist/main.css';
import Menubar from './Menubar';
import Home from './Home';
import Accounts from './AccountView/Accounts';
import Reports from './Reports/Reports';
import Plans from './Plans/Plans';
import PlaidLink from './PlaidLink';
import MobxStore, { store as mobxStore } from './State/mobxStore';
import UserAccount from './UserAccount';
import usePageViews from './Tracker';
import './style.css';
import AccountDetails from './AccountView/AccountDetails';

const App: React.FC = observer(() => {
  const error = useContext(ServerError);
  usePageViews();

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
    <>
      <Menubar />
      <Outlet />
      <PlaidLink />
    </>
  );
});

const container = document.querySelector('.app');

if (container) {
  const root = createRoot(container);
  root.render(
    <MobxStore.Provider value={mobxStore}>
      <ServerError.Provider value={serverError}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<App />}>
              <Route path="home" element={<Home />} />
              <Route path="plans" element={<Plans />} />
              <Route path="accounts" element={<Accounts />}>
                <Route index element={<div className="register window window1" />} />
                <Route path=":accountId" element={<AccountDetails />} />
              </Route>
              <Route path="reports" element={<Reports />} />
              <Route path="user" element={<UserAccount />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ServerError.Provider>
    </MobxStore.Provider>,
  );
}
