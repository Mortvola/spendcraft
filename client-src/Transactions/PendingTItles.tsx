import React, { ReactElement } from 'react';

type PropsType = {
  categoryView?: boolean,
}

const PendingTitles = ({
  categoryView = false,
}: PropsType): ReactElement => {
  const commonTitles = () => (
    <>
      <div />
      <div>Date</div>
      <div>Name</div>
      <div className="currency">Amount</div>
    </>
  );

  if (!categoryView) {
    return (
      <div className="register-title acct-pending-transaction">
        {commonTitles()}
      </div>
    );
  }

  return (
    <div className="register-title pending-transaction">
      {commonTitles()}
      <div>Institution</div>
      <div>Account</div>
    </div>
  );
};

export default PendingTitles;
