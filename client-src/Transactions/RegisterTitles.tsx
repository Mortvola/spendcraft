import React, { ReactElement } from 'react';
import useMediaQuery from '../MediaQuery';
import TitleStub from './TitleStub';
import styles from './Transactions.module.css';

type PropsType = {
  categoryView?: boolean,
}

const RegisterTitles = ({
  categoryView = false,
}: PropsType): ReactElement => {
  const { isMobile } = useMediaQuery();

  if (isMobile) {
    return (
      <div className={`mobile register-title ${styles.transaction}`}>
        <div>Date</div>
        <div>Name</div>
        <div className="currency">Amount</div>
      </div>
    );
  }

  const commonTitles = () => (
    <>
      <div />
      <div>Date</div>
      <div>Name</div>
    </>
  );

  if (!categoryView) {
    return (
      <div className="register-title acct-transaction">
        {commonTitles()}
        <div className="currency">Amount</div>
        <div className="currency">Balance</div>
        <div />
        <TitleStub />
      </div>
    );
  }

  return (
    <div className={`register-title ${styles.transaction}`}>
      {commonTitles()}
      <div className="currency">Trx Amount</div>
      <div className="currency">Amount</div>
      <div className="currency">Balance</div>
      <div>Institution</div>
      <div>Account</div>
      <TitleStub />
    </div>
  );
};

export default RegisterTitles;
