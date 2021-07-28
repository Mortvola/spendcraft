import React, { useState, useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import IconButton from '../IconButton';
import DetailView from '../DetailView';
import AccountView from './AccountView';
import MobxStore from '../state/mobxStore';

const Accounts = () => {
  const {
    accounts, register, balances, uiState: { selectedAccount },
  } = useContext(MobxStore);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (selectedAccount) {
      if (selectedAccount.tracking === 'Transactions') {
        selectedAccount.getTransactions();
      }
      else {
        balances.load(selectedAccount);
      }
    }
  }, [balances, selectedAccount]);

  const handleClick = () => {
    accounts.addInstitution();
  };

  const handleRefresh = () => {
    setRefreshing(true);

    fetch('/api/institutions/sync', {
      method: 'POST',
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
      {
        selectedAccount
          ? <DetailView detailView={selectedAccount.tracking} />
          : null
      }
    </>
  );
};

export default observer(Accounts);
