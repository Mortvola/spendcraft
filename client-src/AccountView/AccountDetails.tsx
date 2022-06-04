import { observer } from 'mobx-react-lite';
import React from 'react';
import DetailView from '../DetailView';
import { useStores } from '../State/mobxStore';

const AccountDetails: React.FC = observer(() => {
  const {
    balances, uiState: { selectedAccount },
  } = useStores();

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
