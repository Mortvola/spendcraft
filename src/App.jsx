import React, { useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import { Provider, connect } from 'react-redux';
import { usePlaidLink } from 'react-plaid-link';
import store from './redux/store';
import Menubar from './Menubar';
import Home from './Home';
import Accounts from './Accounts';
import Reports from './Reports/Reports';
import Plans from './Plans/Plans';
import { hidePlaidLink, addInstitution } from './redux/actions';

const Logout = () => {
  window.location.assign('/logout');

  return null;
};

const mapStateToProps = (state) => ({
  view: state.selections.view,
  showPlaidLink: state.dialogs.plaid.show,
  publicToken: state.dialogs.plaid.publicToken,
});

const App = ({
  view,
  showPlaidLink,
  publicToken,
  dispatch,
}) => {
  const onExit = useCallback((err, metaData) => {
    if (err) {
      console.log(err);
      console.log(JSON.stringify(metaData));
    }
    dispatch(hidePlaidLink());
  }, []);

  const onSuccess = useCallback((publicToken2, metadata) => {
    if (publicToken2) {
      fetch('/institution', {
        method: 'POST',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicToken: publicToken2,
          institution: metadata.institution,
        }),
      })
        .then(async (response) => {
          const json = await response.json();

          dispatch(addInstitution({ id: json.id, name: json.name, accounts: [] }));

          // openAccountSelectionDialog(json.id, json.accounts);
        });
    }
    dispatch(hidePlaidLink());
  }, []);

  const { open, ready } = usePlaidLink({
    apiVersion: 'v2',
    clientName: process.env.APP_NAME,
    env: process.env.PLAID_ENV,
    product: process.env.PLAID_PRODUCTS.split(','),
    publicKey: process.env.PLAID_PUBLIC_KEY,
    countryCodes: process.env.PLAID_COUNTRY_CODES.split(','),
    token: publicToken,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (open && ready && showPlaidLink) {
      open();
    }
  }, [open, ready, showPlaidLink]);

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

  return (
    <>
      <Menubar />
      <div className="main">
        {renderMain()}
      </div>
    </>
  );
};

App.propTypes = {
  view: PropTypes.string.isRequired,
  showPlaidLink: PropTypes.bool.isRequired,
  publicToken: PropTypes.string,
  dispatch: PropTypes.func.isRequired,
};

App.defaultProps = {
  publicToken: null,
};

const ConnectedApp = connect(mapStateToProps)(App);

ReactDOM.render(
  <Provider store={store}>
    <ConnectedApp />
  </Provider>,
  document.querySelector('.app'),
);
