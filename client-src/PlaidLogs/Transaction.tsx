import React from 'react';
import * as PlaidApi from 'plaid';
import styles from './Transaction.module.scss';

interface PropsType {
  transaction: PlaidApi.Transaction,
}

const Transaction: React.FC<PropsType> = ({
  transaction,
}) => (
  <div key={transaction.transaction_id} className={styles.transaction}>
    <label>
      Date:
      <div>{transaction.date}</div>
    </label>
    <label>
      Name:
      <div>{transaction.name}</div>
    </label>
    <label>
      Amount:
      <div>{transaction.amount}</div>
    </label>
    <label>
      Trx ID:
      <div>{transaction.transaction_id}</div>
    </label>
    <label>
      Pending Trx ID:
      <div>{transaction.pending_transaction_id}</div>
    </label>
    <label>
      Account ID:
      <div>{transaction.account_id}</div>
    </label>
    <label>
      Pending:
      <div>{transaction.pending.toString()}</div>
    </label>
    <label>
      Payment Channel:
      <div>{transaction.payment_channel}</div>
    </label>
    <label>
      Merchant Name:
      <div>{transaction.merchant_name}</div>
    </label>
    <label>
      Account Owner:
      <div>{transaction.account_owner}</div>
    </label>
  </div>

)

export default Transaction;
