import { observer } from 'mobx-react-lite';
import React from 'react';
import { Nav } from 'react-bootstrap';
import { useStores } from '../State/Store';
import Register from '../Transactions/Register';
import BalanceHistory from './BalanceHistory';
import styles from '../Transactions/Transactions.module.scss';
import styles2 from './AccountDetails.module.scss'
import PendingRegister from '../Transactions/PendingRegister';
import StatementsView from './Statements';

enum Tab {
  Transaction = 'transaction',
  Pending = 'pending',
  Balances = 'balances',
  Statements = 'statement',
}

const AccountDetails: React.FC = observer(() => {
  const {
    uiState: { selectedAccount },
  } = useStores();

  const [selected, setSelected] = React.useState<Tab>(Tab.Transaction)

  const handleSelect = (eventKey: string | null) => {
    if (eventKey !== null) {
      setSelected(eventKey as Tab)
    }
  }

  if (!selectedAccount) {
    return null;
  }

  const renderTab = () => {
    switch (selected) {
      case Tab.Transaction:
        return <Register className={styles.acct} type="account" />

      case Tab.Pending:
        return <PendingRegister trxContainer={selectedAccount.pendingTransactions} />

      case Tab.Balances:
        return <BalanceHistory />

      case Tab.Statements:
        return <StatementsView account={selectedAccount} />

      default:
        return null
    }
  }

  return (
    <div className={`${styles2.layout}`}>
      <div className={`${styles2.mainTrayTitle} ellipsis`}>{`${selectedAccount.institution.name}: ${selectedAccount.name}`}</div>
      <Nav variant="underline" className={styles2.menu} onSelect={handleSelect} activeKey={selected}>
        <Nav.Link as="div" eventKey={Tab.Transaction}>Transactions</Nav.Link>
        <Nav.Link as="div" eventKey={Tab.Pending}>Pending</Nav.Link>
        <Nav.Link as="div" eventKey={Tab.Balances}>Balances</Nav.Link>
        <Nav.Link as="div" eventKey={Tab.Statements}>Statements</Nav.Link>
      </Nav>
      <div className={styles2.content}>
        {
          renderTab()
        }
      </div>
    </div>
  );
});

export default AccountDetails;
