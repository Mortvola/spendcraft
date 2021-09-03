import React from 'react';
import { observer } from 'mobx-react-lite';
import IconButton from '../IconButton';
import { formatNumber } from '../NumberFormat';
import { AccountInterface } from '../state/State';
import Institution from '../state/Institution';
import { getSubTypeName, getTypeName } from '../state/AccountTypes';

type PropsType = {
  selected: boolean,
  institution: Institution,
  account: AccountInterface,
  onAccountSelected: ((account: AccountInterface) => void),
  showAccountDialog: ((account: AccountInterface) => void),
}

const Account = ({
  selected,
  institution,
  account,
  onAccountSelected,
  showAccountDialog,
}: PropsType) => {
  const refresh = () => {
    account.refresh(institution.id);
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
    balance += ` as of ${account.syncDate.toFormat('LL-dd-y T')}`;
  }

  return (
    <div className="acct-list-item">
      {
        !institution.offline
          ? <IconButton icon="sync-alt" rotate={account.refreshing} onClick={refresh} />
          : <IconButton icon="edit" onClick={() => showAccountDialog(account)} />
      }
      <div className="acct-info">
        <div className={className} onClick={accountSelected}>{account.name}</div>
        <div className="acct-balance">{balance}</div>
        <div>{getTypeName(account.type)}</div>
        <div>{getSubTypeName(account.type, account.subtype)}</div>
        {
          account.type === 'loan'
            ? (
              <div>
                {
                  account.rate === null
                    ? 'APR: unknown'
                    : `APR: ${account.rate}%`
                }
              </div>
            )
            : null
        }
      </div>
    </div>
  );
};

export default observer(Account);
