import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../../Amount';
import { AccountInterface, TransactionInterface } from '../../State/State';
import useMediaQuery from '../../MediaQuery';
import { TransactionType } from '../../../common/ResponseTypes';

type PropsType = {
  transaction: TransactionInterface,
  amount: number,
  runningBalance: number,
  account: AccountInterface,
}

const AccountTransaction: React.FC<PropsType> = observer(({
  transaction,
  amount,
  runningBalance,
  account,
}) => {
  const { isMobile } = useMediaQuery();

  if (isMobile) {
    return (
      <Amount className="transaction-field currency" amount={amount} />
    );
  }

  const handleReconcileChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    transaction.toggleReconciled();
  };

  const handleReconcileClick: React.MouseEventHandler<HTMLInputElement> = (event) => {
    event.stopPropagation();
  };

  const loanFields = () => (
    <>
      <Amount className="transaction-field currency" amount={transaction.amount} />
      {
        transaction.type !== TransactionType.STARTING_BALANCE
          ? (
            <>
              <Amount className="transaction-field currency" amount={transaction.amount - amount} />
              <Amount className="transaction-field currency" amount={amount} />
            </>
          )
          : (
            <>
              <div />
              <div />
            </>
          )
      }
    </>
  );

  return (
    <>
      <div className="transaction-field">{transaction.name}</div>
      {
        // eslint-disable-next-line no-nested-ternary
        account.type === 'loan'
          ? (
            loanFields()
          )
          : <Amount className="transaction-field currency" amount={amount} />
      }
      <Amount className="transaction-field currency" amount={runningBalance} />
      <input
        type="checkbox"
        checked={transaction.reconciled}
        onChange={handleReconcileChange}
        onClick={handleReconcileClick}
      />
    </>
  );
});

export default AccountTransaction;
