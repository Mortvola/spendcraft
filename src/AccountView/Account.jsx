import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import moment from 'moment';
import {
  refreshAccount,
} from '../redux/actions';
import IconButton from '../IconButton';
import { formatNumber } from '../NumberFormat';

const Account = ({
  selected,
  institutionId,
  account,
  dispatch,
  onAccountSelected,
}) => {
  const refresh = () => {
    dispatch(refreshAccount(institutionId, account.id));
  };

  const accountSelected = () => {
    onAccountSelected(account);
  };

  let className = 'acct-list-acct';
  if (selected) {
    className += ' selected';
  }

  let balance = formatNumber(account.balance);
  if (account.syncDate) {
    balance += ` as of ${moment.utc(account.syncDate).local().format('M-D-YY HH:mm:ss')}`;
  }

  return (
    <div className="acct-list-item">
      <IconButton icon="sync-alt" rotate={account.refreshing} onClick={refresh} />
      <div>
        <div className={className} onClick={accountSelected}>{account.name}</div>
        <div className="acct-balance">{balance}</div>
      </div>
    </div>
  );
};

Account.propTypes = {
  institutionId: PropTypes.number.isRequired,
  account: PropTypes.shape({
    name: PropTypes.string.isRequired,
    id: PropTypes.number.isRequired,
    syncDate: PropTypes.string,
    balance: PropTypes.number,
    tracking: PropTypes.string,
    refreshing: PropTypes.bool,
  }).isRequired,
  onAccountSelected: PropTypes.func.isRequired,
  selected: PropTypes.bool.isRequired,
  dispatch: PropTypes.func.isRequired,
};

export default connect()(Account);
