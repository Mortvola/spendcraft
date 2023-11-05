import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  TransactionContainerInterface,
} from '../State/State';
import PleaseWait from '../PleaseWait';
import styles from './Transactions.module.scss';
import RemoteDataManager from '../RemoteDataManager';

type PropsType = {
  trxContainer: TransactionContainerInterface,
  children?: React.ReactNode,
}

const RegisterTransactions: React.FC<PropsType> = observer(({
  trxContainer,
  children,
}) => {
  const handleGetData = () => (
    trxContainer.getTransactions()
  )

  const handleGetMoreData = () => (
    trxContainer.getMoreTransactions()
  )

  return (
    <RemoteDataManager onGetData={handleGetData} onGetMoreData={handleGetMoreData}>
      <div className={styles.transactions}>
        {children}
      </div>
    </RemoteDataManager>
  );
});

export default RegisterTransactions;
