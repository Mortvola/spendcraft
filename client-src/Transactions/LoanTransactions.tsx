import React from 'react';
import Amount from '../Amount';
import LoanTransaction from '../State/LoanTransaction';

type LoanType = {
  balance: number,
  transactions: LoanTransaction[],
}

type PropsType = {
  loan?: LoanType,
}

const LoanTransactions: React.FC<PropsType> = ({
  loan,
}) => {
  if (loan) {
    let runningBalance = loan.balance;
    return (
      <>
        {
          loan.transactions.map((transaction) => {
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
          })
        }
      </>
    );
  }

  return null;
};

export default LoanTransactions;
