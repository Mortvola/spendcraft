import React, { useContext } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import { observer } from 'mobx-react-lite';
import { Provider, connect } from 'react-redux';
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

const mapStateToProps = (state) => ({
  view: state.selections.view,
});

const App = ({
  view,
}) => {
  const { accounts } = useContext(MobxStore);
  const isMobile = window.innerWidth <= 500;

  const renderMain = () => {
    switch (view) {
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

App.propTypes = {
  view: PropTypes.string.isRequired,
};

const ConnectedApp = connect(mapStateToProps)(observer(App));

ReactDOM.render(
  <MobxStore.Provider value={mobxStore}>
    <Provider store={store}>
      <ConnectedApp />
    </Provider>
  </MobxStore.Provider>,
  document.querySelector('.app'),
);
