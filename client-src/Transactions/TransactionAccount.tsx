import React from 'react';
import styles from './Transactions.module.scss';
import { BaseTransactionInterface } from '../State/Types';

type PropsType = {
  transaction: BaseTransactionInterface,
}

const TransactionAccount: React.FC<PropsType> = ({
  transaction,
}) => (
  <div className={`${styles.account}`}>
    {
      transaction.instituteName !== ''
        ? `${transaction.instituteName}: ${transaction.accountName}`
        : null
    }
  </div>
)

export default TransactionAccount;
