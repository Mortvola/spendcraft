import React, { ReactElement, ReactNode } from 'react';
import styles from './SecondaryRegister.module.scss';
import transactionStyles from './Transactions.module.scss';
import useMediaQuery from '../MediaQuery';
import RemoteDataManager from '../RemoteDataManager';
import { TransactionContainerInterface } from '../State/State';

type PropsType = {
  trxContainer: TransactionContainerInterface,
  title: string,
  titles: ReactElement,
  children: ReactNode,
}

const SecondaryRegister: React.FC<PropsType> = ({
  trxContainer,
  title,
  titles,
  children,
}) => {
  const { isMobile } = useMediaQuery();

  const handleGetData = () => (
    trxContainer.getTransactions()
  )

  const handleGetMoreData = () => (
    trxContainer.getMoreTransactions()
  )

  return (
    <div className={`${styles.pending} ${transactionStyles.pending} window`}>
      {
        isMobile
          ? null
          : (
            <div className={styles.pendingRegisterTitle}>
              {title}
            </div>
          )
      }
      {
        isMobile
          ? null
          : titles
      }
      <RemoteDataManager onGetData={handleGetData} onGetMoreData={handleGetMoreData}>
        <div className={`${transactionStyles.transactions} striped`}>
          {children}
        </div>
      </RemoteDataManager>
    </div>
  );
}

export default SecondaryRegister;
