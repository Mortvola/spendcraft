import React from 'react';
import PropTypes from 'prop-types';
import moment from 'moment';
import { observer } from 'mobx-react-lite';
import IconButton from '../IconButton';
import { formatNumber } from '../NumberFormat';
import { AccountInterface } from '../state/State';

type PropsType = {
  selected: boolean,
  institutionId: number,
  account: AccountInterface,
  onAccountSelected: ((account: AccountInterface) => void),
}

const Account = ({
  selected,
  institutionId,
  account,
  onAccountSelected,
}: PropsType) => {
  const refresh = () => {
    account.refresh(institutionId);
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

export default observer(Account);
