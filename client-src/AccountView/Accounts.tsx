import React, { useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import DetailView from '../DetailView';
import AccountView from './AccountView';
import MobxStore from '../State/mobxStore';

const Accounts = () => {
  const {
    balances, uiState: { selectedAccount },
  } = useContext(MobxStore);

  useEffect(() => {
    if (selectedAccount) {
      switch (selectedAccount.tracking) {
        case 'Transactions':
          selectedAccount.getTransactions();
          break;

        case 'Uncategorized Transactions':
          selectedAccount.getTransactions();
          break;

        case 'Balances':
          balances.load(selectedAccount);
          break;

        default:
          throw new Error('Invalid tracking type');
      }
    }
  }, [balances, selectedAccount]);

  return (
    <>
      <div className="side-bar window">
        <div className="accounts">
          <div className="account-bar">
            Institutions & Accounts
          </div>
          <AccountView />
        </div>
      </div>
      {
        selectedAccount
          ? (
            <DetailView detailView={selectedAccount.tracking} />
          )
          : <div className="register window" />
      }
    </>
  );
};

export default observer(Accounts);
