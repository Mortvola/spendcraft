import React, { ReactElement, useContext } from 'react';
import ReactDOM from 'react-dom';
import { observer } from 'mobx-react-lite';
import 'regenerator-runtime';
import Menubar from './Menubar';
import Home from './Home';
import Accounts from './AccountView/Accounts';
import Reports from './Reports/Reports';
import Plans from './Plans/Plans';
import PlaidLink from './PlaidLink';
import DetailView from './DetailView';
import MobxStore, { store as mobxStore } from './State/mobxStore';
import { httpPost } from './State/Transports';
import ServerError, { serverError } from './State/ServerError';
import HomeToolbar from './CategoryView/CategoryViewToolbar';
import AccountsToolbar from './AccountView/AccountsToolbar';
import PlansToolbar from './Plans/PlansToolbar';

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
  const isMobile = window.innerWidth <= 500;

  let main = <div />;
  let toolbar: ReactElement | null = null
  let page = '';
  switch (uiState.view) {
    case 'HOME':
      main = <Home />;
      toolbar = <HomeToolbar />
      page = 'home-page';
      break;

    case 'ACCOUNTS':
      main = <Accounts />;
      toolbar = <AccountsToolbar />
      page = 'accounts-page';
      break;

    case 'REPORTS':
      main = <Reports />;
      page = 'reports-page'
      break;

    case 'PLANS':
      main = <Plans />;
      toolbar = <PlansToolbar />
      page = 'plans-page'
      break;

    case 'LOGOUT':
      main = <Logout />;
      break;

    default:
      main = <div />;
  }

  const renderDesktop = () => (
    <div className="main">
      {
        toolbar
          ? (
            <div className="toolbar">
              {toolbar}
            </div>
          )
          : <div />
      }
      <div className={`main-tray ${page}`}>
        {main}
      </div>
      <PlaidLink />
    </div>
  );

  const renderMobile = () => (
    <DetailView detailView="Transactions" isMobile />
  );

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
      {
        isMobile
          ? renderMobile()
          : renderDesktop()
      }
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
