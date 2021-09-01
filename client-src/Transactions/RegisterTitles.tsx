import React, { ReactElement } from 'react';
import { AccountInterface } from '../state/State';

type PropsType = {
  categoryView?: boolean,
  account?: AccountInterface | null,
}

const RegisterTitles = ({
  categoryView = false,
  account = null,
}: PropsType): ReactElement => {
  const commonTitles = () => (
    <>
      <div />
      <div>Date</div>
      <div>Name</div>
      {
        account === null || account.tracking === 'Transactions'
          ? (
            <div>Category</div>
          )
          : null
      }
      <div className="currency">Amount</div>
      <div className="currency">Balance</div>
    </>
  );

  if (!categoryView) {
    return (
      <div className="register-title acct-transaction">
        {commonTitles()}
      </div>
    );
  }

  return (
    <div className="register-title transaction">
      {commonTitles()}
      <div>Institution</div>
      <div>Account</div>
    </div>
  );
};

export default RegisterTitles;
