import { observer } from 'mobx-react-lite';
import React from 'react';
import { useParams } from 'react-router-dom';
import DetailView from '../DetailView';
import MobxStore from '../State/mobxStore';
import { AccountInterface } from '../State/State';

const AccountDetails: React.FC = observer(() => {
  const {
    balances, accounts, uiState,
  } = React.useContext(MobxStore);
  const params = useParams();
  const [selectedAccount, setSelectedAccount] = React.useState<null | AccountInterface>(null);

  React.useEffect(() => {
    if (params.accountId !== undefined) {
      const acct = accounts.findAccount(parseInt(params.accountId, 10));
      uiState.selectAccount(acct);
      setSelectedAccount(acct);
    }
  }, [accounts, accounts.institutions, params, params.accountId, uiState]);

  React.useEffect(() => {
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

  if (!selectedAccount) {
    return null;
  }

  return (
    <DetailView
      detailView={selectedAccount.tracking}
      title={`${selectedAccount.institution.name}: ${selectedAccount.name}`}
      type="account"
    />
  );
});

export default AccountDetails;
