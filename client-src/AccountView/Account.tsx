import React from 'react';
import { observer } from 'mobx-react-lite';
import IconButton from '../IconButton';
import { AccountInterface, InstitutionInterface } from '../State/State';
import { getSubTypeName, getTypeName } from '../State/AccountTypes';
import Amount from '../Amount';

type PropsType = {
  selected: boolean,
  institution: InstitutionInterface,
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

  let syncDate: string | null = null;
  if (account.syncDate) {
    syncDate = `as of ${account.syncDate.toFormat('LL-dd-y T')}`;
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
        <div style={{ display: 'flex' }}>
          <Amount style={{ textAlign: 'left' }} amount={account.balance} />
          {
            account.plaidBalance !== null && account.balance !== account.plaidBalance
              ? (
                <>
                  <div>/</div>
                  <Amount style={{ textAlign: 'left' }} amount={account.plaidBalance} />
                </>
              )
              : null
          }
        </div>
        <div style={{ marginLeft: '1rem' }}>{syncDate}</div>
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
