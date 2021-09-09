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
      <div className="currency">Amount</div>
      <div className="currency">Balance</div>
    </>
  );

  if (!categoryView) {
    return (
      <div className="register-title acct-transaction">
        {commonTitles()}
        <div />
        <div style={{ overflowY: 'scroll', visibility: 'hidden', padding: 0 }} />
      </div>
    );
  }

  return (
    <div className="register-title transaction">
      {commonTitles()}
      <div>Institution</div>
      <div>Account</div>
      <div style={{ overflowY: 'scroll', visibility: 'hidden', padding: 0 }} />
    </div>
  );
};

export default RegisterTitles;
