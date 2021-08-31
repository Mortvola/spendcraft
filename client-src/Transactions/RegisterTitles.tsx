import React, { ReactElement } from 'react';

type PropsType = {
  categoryView?: boolean,
}

const RegisterTitles = ({
  categoryView = false,
}: PropsType): ReactElement => {
  const commonTitles = () => (
    <>
      <div />
      <div>Date</div>
      <div>Name</div>
      <div>Category</div>
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
