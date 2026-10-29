import React from 'react';
import { observer } from 'mobx-react-lite';
import MoneyCentsAmount from '../MoneyCentsAmount';
import { parseMoneyCents, subtractMoneyCents, type MoneyCents } from '../../common/moneyCents';
import { AccountInterface, BaseTransactionInterface, TransactionInterface } from '../State/Types';
import styles from './Transactions.module.scss';
import TransactionAccount from './TransactionAccount';
import { AccountType, TransactionType } from '../../common/ResponseTypes';
import AccountOwner from './AccountOwner';
import Reconcile from './Reconcile';
import Date from '../Date';
import { ArrowRightLeft } from 'lucide-react';

interface PropsType {
  transaction: TransactionInterface,
  className?: string,
  amountCents: MoneyCents,
  runningBalanceCents: MoneyCents,
  account?: AccountInterface | null,
  onClick?: (transaction: BaseTransactionInterface) => void,
}

const Transaction: React.FC<PropsType> = observer(({
  transaction,
  className,
  amountCents,
  runningBalanceCents,
  account,
  onClick,
}) => {
  const handleClick: React.MouseEventHandler = () => {
    if (onClick) {
      onClick(transaction);
    }
  };

  const transactionAmount = () => {
    if (
      [
        TransactionType.FUNDING_TRANSACTION,
        TransactionType.REBALANCE_TRANSACTION,
      ].includes(transaction.type)
      || transaction.amountCents === amountCents
    ) {
      return <div className={`${styles.trxAmount} currency`} />;
    }

    return <MoneyCentsAmount className={`${styles.trxAmount} currency`} amount={transaction
      .amountCents} />
  }

  const loanFields = () => (
    account?.type === AccountType.Loan
      ? (
        <div className={`${className ?? ''} ${styles.transaction}`} onClick={handleClick}>
          <MoneyCentsAmount className="currency" amount={transaction.amountCents} />
          {
            transaction.type !== TransactionType.STARTING_BALANCE
              ? (
                <>
                  <MoneyCentsAmount className="currency" amount={subtractMoneyCents(transaction
                    .amountCents, transaction.principleCents ?? parseMoneyCents('0.00'))} />
                  <MoneyCentsAmount className="currency" amount={transaction.principleCents ??
                    parseMoneyCents('0.00')} />
                </>
              )
              : (
                <>
                  <div />
                  <div />
                </>
              )
          }
        </div>
      )
      : null
  );

  const accountSign = account?.sign ?? 1
  const reverseClassName = accountSign === -1 ? 'reverse' : ''

  return (
    <div className={`${className ?? ''} ${styles.transaction} ${transaction.pending ? styles
      .pendingTrx : ''}`} onClick={handleClick}>
      {
        transaction.duplicateOfTransactionId
          ? <ArrowRightLeft />
          : <div />
      }
      <Date className={styles.date} date={transaction.date} />
      <div className={styles.name}>{transaction.name}</div>
      <MoneyCentsAmount className={`${styles.amount} currency ${reverseClassName}`} amount={
        accountSign === -1
        ? subtractMoneyCents(parseMoneyCents('0.00'), amountCents) : amountCents} />
      <MoneyCentsAmount className={`${styles.runningBalance} currency ${reverseClassName}`} amount={
        runningBalanceCents} />
      <TransactionAccount transaction={transaction} />
      {transactionAmount()}
      { loanFields() }
      <Reconcile transaction={transaction} />
      <div className={styles.pendingFlag}>Pending</div>
      <AccountOwner owner={transaction.accountOwner} />
    </div>
  );
});

export default Transaction;
