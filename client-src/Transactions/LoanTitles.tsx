import React, { ReactElement } from 'react';

const LoanTitles = (): ReactElement => (
  <div className="register-title loan-transaction">
    <div />
    <div>Date</div>
    <div>Name</div>
    <div className="currency">Principle</div>
    <div className="currency">Interest</div>
    <div className="currency">Balance</div>
    <div />
  </div>
)

export default LoanTitles;
