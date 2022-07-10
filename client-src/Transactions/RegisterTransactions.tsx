import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  TransactionContainerInterface,
} from '../State/State';
import PleaseWait from '../PleaseWait';
import styles from './Transactions.module.css';
import useTrxPager from './TrxPager';

type PropsType = {
  trxContainer: TransactionContainerInterface,
  children?: React.ReactNode,
}

const RegisterTransactions: React.FC<PropsType> = observer(({
  trxContainer,
  children,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const checkForNeededData = useTrxPager(trxContainer);

  const handleScroll: React.UIEventHandler<HTMLDivElement> = () => {
    checkForNeededData(ref.current);
  }

  React.useEffect(() => {
    checkForNeededData(ref.current);
  }, [checkForNeededData]);

  if (
    trxContainer.transactions.length === 0 && trxContainer.transactionsQuery.fetching
  ) {
    return <PleaseWait />;
  }

  return (
    <div ref={ref} className={`${styles.transactions} striped`} onScroll={handleScroll}>
      {children}
    </div>
  );
});

export default RegisterTransactions;
