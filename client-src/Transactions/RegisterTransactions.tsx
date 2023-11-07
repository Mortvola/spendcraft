import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  TransactionContainerInterface,
} from '../State/State';
import styles from './Transactions.module.scss';
import RemoteDataManager from '../RemoteDataManager';
import useMediaQuery from '../MediaQuery';

type PropsType = {
  trxContainer: TransactionContainerInterface,
  titles?: React.ReactElement,
  children?: React.ReactNode,
}

const RegisterTransactions: React.FC<PropsType> = observer(({
  trxContainer,
  titles,
  children,
}) => {
  const { isMobile } = useMediaQuery();

  const handleGetData = () => (
    trxContainer.getTransactions(0)
  )

  const handleGetMoreData = () => (
    trxContainer.getMoreTransactions()
  )

  return (
    <>
      {
        isMobile
          ? null
          : titles
      }
      <RemoteDataManager onGetData={handleGetData} onGetMoreData={handleGetMoreData}>
        <div className={styles.transactions}>
          {children}
        </div>
      </RemoteDataManager>
    </>
  );
});

export default RegisterTransactions;
