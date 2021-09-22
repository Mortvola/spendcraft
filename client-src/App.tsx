import React, { useContext } from 'react';
import ReactDOM from 'react-dom';
import { observer } from 'mobx-react-lite';
import 'regenerator-runtime';
import Menubar from './Menubar';
import Home from './Home';
import Accounts from './AccountView/Accounts';
import Reports from './Reports/Reports';
import Plans from './Plans/Plans';
import PlaidLink from './PlaidLink';
import MobxStore, { store as mobxStore } from './State/mobxStore';
import { httpPost } from './State/Transports';
import ServerError, { serverError } from './State/ServerError';
import UserAccount from './UserAccount';

const Logout = () => {
  (async () => {
    const response = await httpPost('/api/logout');

    if (response.ok) {
      window.location.replace('/');
    }
  })();

  return null;
};

const App = () => {
  const { uiState } = useContext(MobxStore);
  const error = useContext(ServerError);

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

  let page;
  switch (uiState.view) {
    case 'HOME':
      page = <Home />;
      break;

    case 'ACCOUNTS':
      page = <Accounts />;
      break;

    case 'REPORTS':
      page = <Reports />;
      break;

    case 'PLANS':
      page = <Plans />;
      break;

    case 'USER_ACCOUNT':
      page = <UserAccount />
      break;

    case 'LOGOUT':
      page = <Logout />;
      break;

    default:
      break;
  }

  return (
    <>
      <Menubar />
      {page}
      <PlaidLink />
    </>
  );
};

const ObserverApp = observer(App);

ReactDOM.render(
  <MobxStore.Provider value={mobxStore}>
    <ServerError.Provider value={serverError}>
      <ObserverApp />
    </ServerError.Provider>
  </MobxStore.Provider>,
  document.querySelector('.app'),
);
