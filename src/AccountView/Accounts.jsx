import React, { useState, useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import IconButton from '../IconButton';
import DetailView from '../DetailView';
import { showPlaidLink } from '../redux/actions';
import AccountView from './AccountView';
import MobxStore from '../redux/mobxStore';

const Accounts = () => {
  const { accounts: { selectedAccount }, register } = useContext(MobxStore);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    register.loadAccountTransactions(selectedAccount);
  }, [selectedAccount]);

  const handleClick = () => {
    // dispatch(showPlaidLink());
  };

  const handleRefresh = () => {
    setRefreshing(true);

    fetch('/institutions/sync', {
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
