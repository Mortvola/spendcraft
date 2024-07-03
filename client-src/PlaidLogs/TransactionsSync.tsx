import React from 'react';
import * as PlaidApi from 'plaid';
import styles from './TransactionsSync.module.scss';
import Transaction from './Transaction';

type PropsType = {
  response: PlaidApi.TransactionsSyncResponse,
}

const TransactionsSync: React.FC<PropsType> = ({
  response,
}) => (
  <div className={styles.layout}>
    <label>
      Request ID:
      <div>{response.request_id}</div>
    </label>
    <label>
      Transaction Update Status:
      <div>{response.transactions_update_status}</div>
    </label>
    <label>
      Next Cursor:
      <div>{response.next_cursor}</div>
    </label>
    <label>
      Has More:
      <div>{response.has_more.toString()}</div>
    </label>
    <div className={styles.section}>Accounts:</div>
    <div className={styles.transactionsWrapper}>
      {
        response.accounts.map((acct) => (
          <div key={acct.account_id} className={styles.account}>
            <label>
              Name:
              <div>{acct.name}</div>
            </label>
            <label>
              Account ID:
              <div>{acct.account_id}</div>
            </label>
            <label>
              Balance:
              <div>{acct.balances.current}</div>
            </label>
            <label>
              Available:
              <div>{acct.balances.available}</div>
            </label>
            <label>
              Limit:
              <div>{acct.balances.limit}</div>
            </label>
            <label>
              Last Updated:
              <div>{acct.balances.last_updated_datetime}</div>
            </label>
          </div>
        ))
      }
    </div>
    <div className={styles.section}>Added Transactions:</div>
    <div className={styles.transactionsWrapper}>
      {
        response.added.map((trx) => (
          <Transaction key={trx.transaction_id} transaction={trx} />
        ))
      }
    </div>
    <div className={styles.section}>Modified Transactions:</div>
    <div className={styles.transactionsWrapper}>
      {
        response.modified.map((trx) => (
          <Transaction key={trx.transaction_id} transaction={trx} />
        ))
      }
    </div>
    <div className={styles.section}>Removed Transactions:</div>
    <div className={styles.transactionsWrapper}>
      {
        response.removed.map((trx) => (
          <div key={trx.transaction_id}>
            <label>
              Trx ID:
              <div>{trx.transaction_id}</div>
            </label>
            <label>
              Account ID:
              <div>{trx.account_id}</div>
            </label>
          </div>
        ))
      }
    </div>
  </div>
)

export default TransactionsSync;
