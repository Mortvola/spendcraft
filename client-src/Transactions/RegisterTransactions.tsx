import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  TransactionContainerInterface,
} from '../State/Types';
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

  return (
    <>
      {
        isMobile
          ? null
          : titles
      }
      <RemoteDataManager data={trxContainer}>
        <div className={styles.transactions}>
          {children}
        </div>
      </RemoteDataManager>
    </>
  );
});

export default RegisterTransactions;
