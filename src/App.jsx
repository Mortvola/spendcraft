import React, { useContext } from 'react';
import ReactDOM from 'react-dom';
import { observer } from 'mobx-react-lite';
import { Provider } from 'react-redux';
import 'regenerator-runtime';
import store from './redux/store';
import Menubar from './Menubar';
import Home from './Home';
import Accounts from './AccountView/Accounts';
import Reports from './Reports/Reports';
import Plans from './Plans/Plans';
import PlaidLink from './PlaidLink';
import DetailView from './DetailView';
import MobxStore, { store as mobxStore } from './redux/mobxStore';

const Logout = () => {
  fetch('/logout', {
    method: 'POST',
    headers: {
      'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
    },
  })
    .then((response) => {
      if (response.ok) {
        window.location.replace('/');
      }
    });

  return null;
};

const App = () => {
  const { uiState } = useContext(MobxStore);
  const isMobile = window.innerWidth <= 500;

  const renderMain = () => {
    switch (uiState.view) {
      case 'home':
        return <Home />;

      case 'accounts':
        return <Accounts />;

      case 'reports':
        return <Reports />;

      case 'plans':
        return <Plans />;

      case 'logout':
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

const ConnectedApp = observer(App);

ReactDOM.render(
  <MobxStore.Provider value={mobxStore}>
    <Provider store={store}>
      <ConnectedApp />
    </Provider>
  </MobxStore.Provider>,
  document.querySelector('.app'),
);
