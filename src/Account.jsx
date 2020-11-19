import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import moment from 'moment';
import {
  receiveCategoryBalances,
  accountSynced,
} from './redux/actions';
import IconButton from './IconButton';
import { formatNumber } from './NumberFormat';

const Account = ({
  selected,
  institutionId,
  account,
  dispatch,
  ...props
}) => {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = () => {
    setRefreshing(true);

    fetch(`/institution/${institutionId}/accounts/${account.id}/transactions/sync`, {
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
      .then((json) => {
        const { categories, accounts } = json;
        if (categories && categories.length > 0) {
          dispatch(receiveCategoryBalances(categories));
        }

        if (accounts) {
          dispatch(accountSynced(
            institutionId, account.id, accounts[0].balance, accounts[0].syncDate,
          ));
        }
      })
      .catch((error) => {
        console.log(error);
        setRefreshing(false);
      });
  };

  const accountSelected = () => {
    props.onAccountSelected(account.id, account.tracking);
  };

  let className = 'acct-list-acct';
  if (selected) {
    className += ' selected';
  }

  let rotate = false;
  if (refreshing) {
    rotate = true;
  }

  let balance = formatNumber(account.balance);
  if (account.syncDate) {
    balance += ` as of ${moment.utc(account.syncDate).local().format('M-D-YY HH:mm:ss')}`;
  }

  return (
    <div className="acct-list-item">
      <IconButton icon="sync-alt" rotate={rotate} onClick={refresh} />
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
  }).isRequired,
  onAccountSelected: PropTypes.func.isRequired,
  selected: PropTypes.bool.isRequired,
  dispatch: PropTypes.func.isRequired,
};

export default connect()(Account);
