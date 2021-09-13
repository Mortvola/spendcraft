import React, { ReactElement } from 'react';
import useMediaQuery from '../MediaQuery';
import styles from './Transactions.module.css';

type PropsType = {
  categoryView?: boolean,
}

const RegisterTitles = ({
  categoryView = false,
}: PropsType): ReactElement | null => {
  const { isMobile, isDesktop } = useMediaQuery();

  if (isDesktop) {
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
          <div style={{ overflowY: 'scroll', visibility: 'hidden', padding: 0 }} />
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
        <div style={{ overflowY: 'scroll', visibility: 'hidden', padding: 0 }} />
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className={`mobile register-title ${styles.transaction}`}>
        <div>Date</div>
        <div>Name</div>
        <div className="currency">Amount</div>
      </div>
    );
  }

  return null;
};

export default RegisterTitles;
