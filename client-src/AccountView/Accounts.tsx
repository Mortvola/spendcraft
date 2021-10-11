import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import useMediaQuery from '../MediaQuery'
import DetailView from '../DetailView';
import AccountView from './AccountView';
import MobxStore from '../State/mobxStore';
import Main from '../Main';
import AccountsToolbar from './AccountsToolbar';
import styles from './Accounts.module.css';

const Accounts = () => {
  const {
    balances, uiState: { selectedAccount },
  } = useContext(MobxStore);
  const [open, setOpen] = useState<boolean>(false);
  const { isMobile } = useMediaQuery();

  useEffect(() => {
    if (selectedAccount) {
      switch (selectedAccount.tracking) {
        case 'Transactions':
        case 'Uncategorized Transactions':
          selectedAccount.getTransactions();
          selectedAccount.getPendingTransactions();
          break;

        case 'Balances':
          balances.load(selectedAccount);
          break;

        default:
          throw new Error('Invalid tracking type');
      }
    }
  }, [balances, selectedAccount]);

  const handleToggleClick = () => {
    setOpen(!open);
  }

  const handleAccountSelected = () => {
    if (isMobile) {
      setOpen(false);
    }
  }

  return (
    <Main
      open={open}
      toolbar={<AccountsToolbar open={open} />}
      sidebar={(
        <div className={styles.accounts}>
          <div className="account-bar">
            Institutions & Accounts
          </div>
          <AccountView onAccountSelected={handleAccountSelected} />
        </div>
      )}
      onToggleClick={handleToggleClick}
      className={styles.theme}
    >
      {
        selectedAccount
          ? (
            <DetailView
              detailView={selectedAccount.tracking}
              title={`${selectedAccount.institution.name}: ${selectedAccount.name}`}
            />
          )
          : <div className="register window window1" />
      }
    </Main>
  );
};

export default observer(Accounts);
