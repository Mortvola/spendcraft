import { observer } from 'mobx-react-lite';
import React from 'react';
import DetailView from '../DetailView';
import { useStores } from '../State/Store';
import Register from '../Transactions/Register';
import BalanceHistory from './BalanceHistory';
import styles from '../Transactions/Transactions.module.scss';

const AccountDetails: React.FC = observer(() => {
  const {
    uiState: { selectedAccount },
  } = useStores();

  if (!selectedAccount) {
    return null;
  }

  return (
    <DetailView
      className={styles.acct}
      title={`${selectedAccount.institution.name}: ${selectedAccount.name}`}
    >
      {
        selectedAccount.tracking === 'Balances'
          ? <BalanceHistory />
          : <Register type="account" />
      }
    </DetailView>
  );
});

export default AccountDetails;
