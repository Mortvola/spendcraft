import React, { ReactElement } from 'react';
import LoanTransaction from '../state/LoanTransaction';
import LoanTitles from './LoanTitles';
import LoanTransactions from './LoanTransactions';
import SecondaryRegister from './SecondaryRegister';

type LoanType = {
  balance: number,
  transactions: LoanTransaction[],
}

type PropsType = {
  loan?: LoanType,
}

const LoanRegister = ({
  loan,
}: PropsType): ReactElement => (
  <SecondaryRegister
    title="Loan Transactions:"
    titles={<LoanTitles />}
    transactions={<LoanTransactions loan={loan} />}
  />
);

export default LoanRegister;