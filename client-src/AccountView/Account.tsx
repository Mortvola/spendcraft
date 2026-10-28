import React from 'react';
import { observer } from 'mobx-react-lite';
import { Circle, CircleX, Settings } from 'lucide-react';
import LucideButton from '../LucideButton';
import { AccountInterface } from '../State/Types';
import { getSubTypeName } from '../State/AccountTypes';
import MoneyCentsAmount from '../MoneyCentsAmount';
import { parseMoneyCents, subtractMoneyCents, type MoneyCents } from '../../common/moneyCents';
import styles from './Account.module.scss';
import { useDeleteConfirmation } from '../DeleteConfirmation';
import { AccountType } from '../../common/ResponseTypes';

interface PropsType {
  selected: boolean,
  account: AccountInterface,
  onAccountSelected: (account: AccountInterface) => void,
  onAccountStateChange: (account: AccountInterface) => void,
  showAccountDialog: (account: AccountInterface) => void,
}

const Account: React.FC<PropsType> = observer(({
  selected,
  account,
  onAccountSelected,
  onAccountStateChange,
  showAccountDialog,
}) => {
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
      account.setSettings({ closed: !account.closed });
      onAccountStateChange(account);
    },
  );

  const accountSelected = () => {
    onAccountSelected(account);
  };

  let acctClassName = styles.account;
  if (selected) {
    acctClassName += ` ${styles.selected}`;
  }

  const signedBalance = (amount: MoneyCents) => account.sign === -1
    ? subtractMoneyCents(parseMoneyCents('0.00'), amount) : amount;

  return (
    <div className={acctClassName} onClick={accountSelected}>
      <div className={styles.buttons}>
        <LucideButton className={styles.iconButton} onClick={() => showAccountDialog(account)}>
          <Settings size={16} strokeWidth={2.5} />
        </LucideButton>
        <LucideButton
          className={styles.iconButton}
          onClick={handleCloseClick}
        >
          {
            account.closed
              ? <Circle size={16} strokeWidth={2.5} />
              : <CircleX size={16} strokeWidth={2.5} />
          }
        </LucideButton>
      </div>
      <div className={styles.accountInfo}>
        <div className={styles.accountName}>{account.name}</div>
        <div style={{ display: 'flex' }}>
          <MoneyCentsAmount style={{ textAlign: 'left' }} amount={signedBalance(account.balanceCents)} />
          {
            account.plaidBalanceCents !== null && account.balanceCents !== account.plaidBalanceCents
              ? (
                <>
                  <div>/</div>
                  <MoneyCentsAmount style={{ textAlign: 'left' }} amount={signedBalance(account.plaidBalanceCents)} />
                </>
              )
              : null
          }
        </div>
        <div>{getSubTypeName(account.type, account.subtype)}</div>
        {
          account.type === AccountType.Loan
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
      <CloseConfirmation />
    </div>
  );
});

export default Account;
