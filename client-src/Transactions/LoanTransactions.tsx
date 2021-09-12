import React, { ReactElement } from 'react';
import Amount from '../Amount';
import LoanTransaction from '../State/LoanTransaction';

type LoanType = {
  balance: number,
  transactions: LoanTransaction[],
}

type PropsType = {
  loan?: LoanType,
}

const LoanTransactions = ({
  loan,
}: PropsType): ReactElement | null => {
  let list: ReactElement[] | null = null;

  if (loan) {
    let runningBalance = loan.balance;
    list = loan.transactions.map((transaction) => {
      const { principle } = transaction;
      const { interest } = transaction;

      // if (category !== null) {
      //   amount = transaction.getAmountForCategory(category.id);
      // }

      // const selected = selectedTransaction === transaction.id;

      const element = (
        <div key={transaction.id} className="loan-transaction">
          <div />
          <div>{transaction.date}</div>
          <div className="transaction-field">{transaction.name}</div>
          <Amount amount={principle} />
          <Amount amount={interest} />
          <Amount amount={runningBalance} />
        </div>
      );

      if (runningBalance !== undefined) {
        runningBalance -= principle;
      }

      return element;
    });

    return (
      <>
        {list}
      </>
    );
  }

  return null;
};

export default LoanTransactions;
