import React, { useState } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import IconButton from '../IconButton';
import DetailView from '../DetailView';
import { showPlaidLink } from '../redux/actions';
import AccountView from './AccountView';

const mapStateToProps = (state) => ({
  detailView: state.selections.accountTracking,
});

const Accounts = ({
  detailView,
  dispatch,
}) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleClick = () => {
    dispatch(showPlaidLink());
  };

  const handleRefresh = () => {
    setRefreshing(true);

    fetch('/institutions/sync', {
      method: 'POST',
      headers:
      {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }
        setRefreshing(false);
        return response.json();
      })
      .catch((error) => {
        console.log(error);
        setRefreshing(false);
      });
  };

  let rotate = false;
  if (refreshing) {
    rotate = true;
  }

  return (
    <>
      <div className="side-bar">
        <div className="accounts">
          <div className="account-bar">
            <div>Institutions</div>
            <IconButton icon="plus" onClick={handleClick} />
            <IconButton icon="sync-alt" rotate={rotate} onClick={handleRefresh} />
          </div>
          <AccountView />
        </div>
      </div>
      <DetailView detailView={detailView} />
    </>
  );
};

Accounts.propTypes = {
  detailView: PropTypes.string,
  dispatch: PropTypes.func.isRequired,
};

Accounts.defaultProps = {
  detailView: null,
};

export default connect(mapStateToProps)(Accounts);
