import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../../Amount';
import { CategoryInterface, TransactionInterface } from '../../State/State';
import useMediaQuery from '../../MediaQuery';
import { TransactionType } from '../../../common/ResponseTypes';

type PropsType = {
  transaction: TransactionInterface,
  amount: number,
  runningBalance: number,
  category: CategoryInterface,
}

const CategoryTransaction: React.FC<PropsType> = observer(({
  transaction,
  amount,
  runningBalance,
  category,
}) => {
  const { isMobile } = useMediaQuery();

  if (isMobile) {
    return (
      <>
        <div className="transaction-field">{transaction.name}</div>
        <Amount className="transaction-field currency" amount={amount} />
        <div
          className="transaction-field"
          style={{ gridArea: 'account', fontSize: 'x-small' }}
        >
          {`${transaction.instituteName}:${transaction.accountName}`}
        </div>
      </>
    );
  }

  const transactionAmount = () => {
    if (category.type === 'UNASSIGNED') {
      return null;
    }

    if (
      [
        TransactionType.FUNDING_TRANSACTION,
        TransactionType.REBALANCE_TRANSACTION,
      ].includes(transaction.type)
      || transaction.amount === amount
    ) {
      return <div />;
    }

    return <Amount className="transaction-field currency" amount={transaction.amount} />
  }

  return (
    <>
      <div className="transaction-field">{transaction.name}</div>
      {transactionAmount()}
      <Amount className="transaction-field currency" amount={amount} />
      <Amount className="transaction-field currency" amount={runningBalance} />
      <div className="transaction-field">{transaction.instituteName}</div>
      <div className="transaction-field">{transaction.accountName}</div>
    </>
  );
});

export default CategoryTransaction;
