import React, { useContext } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate, useLocation } from 'react-router-dom';
import IconButton from '../IconButton';
import { AccountInterface, InstitutionInterface } from '../State/State';
import { getSubTypeName, getTypeName } from '../State/AccountTypes';
import Amount from '../Amount';
import { useRelinkDialog } from './RelinkDialog';
import styles from './Account.module.css';
import { useDeleteConfirmation } from '../DeleteConfirmation';
import MobxStore from '../State/mobxStore';

type PropsType = {
  selected: boolean,
  institution: InstitutionInterface,
  account: AccountInterface,
  onAccountSelected: (account: AccountInterface) => void,
  onAccountStateChange: (account: AccountInterface) => void,
  showAccountDialog: (account: AccountInterface) => void,
}

const Account: React.FC<PropsType> = observer(({
  selected,
  institution,
  account,
  onAccountSelected,
  onAccountStateChange,
  showAccountDialog,
}) => {
  const [RelinkDialog, showRelinkDialog] = useRelinkDialog();
  const [CloseConfirmation, handleCloseClick] = useDeleteConfirmation(
    account.closed ? 'Open Confirmation' : 'Close Confirmation',
    account.closed ? 'Open' : 'Close',
    (
      <>
        <div>
          {
            `Are you sure you want to ${account.closed ? 'open' : 'close'} this account?`
          }
        </div>
        <div style={{ marginTop: '1rem' }}>
          {
            `Accounts can be ${account.closed ? 'reclosed' : 'reopened'} from the ${account.closed ? 'Opened' : 'Closed'} tab.`
          }
        </div>
      </>
    ),
    () => {
      account.setClosed(!account.closed);
      onAccountStateChange(account);
    },
  );

  const refresh = async () => {
    const result = await account.refresh(institution.id);

    if (!result) {
      showRelinkDialog();
    }
  };

  const accountSelected = () => {
    onAccountSelected(account);
  };

  let syncDate: string | null = null;
  if (account.syncDate) {
    syncDate = `as of ${account.syncDate.toFormat('LL-dd-y T')}`;
  }

  let acctClassName = styles.account;
  if (account.type === 'other') {
    acctClassName += ` ${styles.otherAccount}`
  }
  else if (['loan', 'credit'].includes(account.type)) {
    acctClassName += ` ${styles.creditAccount}`
  }

  if (selected) {
    acctClassName += ` ${styles.selected}`;
  }

  return (
    <div className={acctClassName} onClick={accountSelected}>
      <div className={styles.buttons}>
        {
          !institution.offline
            ? <IconButton icon="sync-alt" rotate={account.refreshing} onClick={refresh} />
            : <IconButton icon="edit" onClick={() => showAccountDialog(account)} />
        }
        <IconButton icon={account.closed ? 'circle' : 'times-circle'} solid={false} onClick={handleCloseClick} />
      </div>
      <div className={styles.accountInfo}>
        <div className={styles.accountName}>{account.name}</div>
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
      <RelinkDialog account={account} />
      <CloseConfirmation />
    </div>
  );
});

export default Account;
