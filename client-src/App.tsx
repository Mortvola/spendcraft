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
import DetailView from './DetailView';
import MobxStore, { store as mobxStore } from './state/mobxStore';
import { httpPost } from './state/Transports';

const Logout = () => {
  (async () => {
    const response = await httpPost('/logout');

    if (response.ok) {
      window.location.replace('/');
    }
  })();

  return null;
};

const App = () => {
  const { uiState } = useContext(MobxStore);
  const isMobile = window.innerWidth <= 500;

  const renderMain = () => {
    switch (uiState.view) {
      case 'HOME':
        return <Home />;

      case 'ACCOUNTS':
        return <Accounts />;

      case 'REPORTS':
        return <Reports />;

      case 'PLANS':
        return <Plans />;

      case 'LOGOUT':
        return <Logout />;

      default:
        return <div />;
    }
  };

  const renderDesktop = () => (
    <div className="main">
      {renderMain()}
      <PlaidLink />
    </div>
  );

  const renderMobile = () => (
    <DetailView detailView="Transactions" isMobile />
  );

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
    <ObserverApp />
  </MobxStore.Provider>,
  document.querySelector('.app'),
);
