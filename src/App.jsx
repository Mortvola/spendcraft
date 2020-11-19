import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import { Provider, connect } from 'react-redux';
import store from './redux/store';
import Menubar from './Menubar';
import Home from './Home';
import Accounts from './Accounts';
import Reports from './Reports/Reports';
import Plans from './Plans/Plans';
import PlaidLink from './PlaidLink';

const Logout = () => {
  window.location.assign('/logout');

  return null;
};

const mapStateToProps = (state) => ({
  view: state.selections.view,
  showPlaidLink: state.dialogs.plaid.show,
  updateMode: state.dialogs.plaid.updateMode,
  linkToken: state.dialogs.plaid.linkToken,
});

const App = ({
  view,
  showPlaidLink,
  updateMode,
  linkToken,
  dispatch,
}) => {
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
        {
          showPlaidLink
            ? <PlaidLink linkToken={linkToken} dispatch={dispatch} updateMode={updateMode} />
            : null
        }
      </div>
    </>
  );
};

App.propTypes = {
  view: PropTypes.string.isRequired,
  showPlaidLink: PropTypes.bool.isRequired,
  updateMode: PropTypes.bool.isRequired,
  linkToken: PropTypes.string,
  dispatch: PropTypes.func.isRequired,
};

App.defaultProps = {
  linkToken: null,
};

const ConnectedApp = connect(mapStateToProps)(App);

ReactDOM.render(
  <Provider store={store}>
    <ConnectedApp />
  </Provider>,
  document.querySelector('.app'),
);
