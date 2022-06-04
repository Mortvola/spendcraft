import React from 'react';
import LoanTransaction from '../State/LoanTransaction';
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

const LoanRegister: React.FC<PropsType> = ({
  loan,
}) => (
  <SecondaryRegister
    title="Loan Transactions:"
    titles={<LoanTitles />}
  >
    <LoanTransactions loan={loan} />
  </SecondaryRegister>
);

export default LoanRegister;
