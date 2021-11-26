import React, { useContext } from 'react';
import ReactDOM from 'react-dom';
import { observer } from 'mobx-react-lite';
import 'regenerator-runtime';
import {
  BrowserRouter as Router, Switch, Route, Redirect,
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

const App = () => {
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
      <Switch>
        <Route path="/home">
          <Home />
        </Route>
        <Route path="/plans">
          <Plans />
        </Route>
        <Route path="/accounts">
          <Accounts />
        </Route>
        <Route path="/reports">
          <Reports />
        </Route>
        <Route path="/user">
          <UserAccount />
        </Route>
        <Route path="/">
          <Redirect to="/home" />
        </Route>
      </Switch>
      <PlaidLink />
    </>
  );
};

const ObserverApp = observer(App);

ReactDOM.render(
  <MobxStore.Provider value={mobxStore}>
    <ServerError.Provider value={serverError}>
      <Router>
        <ObserverApp />
      </Router>
    </ServerError.Provider>
  </MobxStore.Provider>,
  document.querySelector('.app'),
);
