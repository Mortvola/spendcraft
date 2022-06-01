import React, { ReactElement } from 'react';
import useMediaQuery from '../MediaQuery';
import TitleStub from './TitleStub';
import styles from './Transactions.module.css';

type PropsType = {
  categoryView?: boolean,
}

const PendingTitles = ({
  categoryView = false,
}: PropsType): ReactElement => {
  const { isMobile } = useMediaQuery();

  if (isMobile) {
    return (
      <div className={`mobile register-title ${styles.transaction} ${styles.acct}`}>
        <div />
        <div>Date</div>
        <div>Name</div>
        <div className="currency">Amount</div>
      </div>
    )
  }

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
      <div className={`register-title ${styles.acct} ${styles.pending} ${styles.transaction}`}>
        {commonTitles()}
        <div />
        <TitleStub />
      </div>
    );
  }

  return (
    <div className={`register-title ${styles.pending} ${styles.transaction}`}>
      {commonTitles()}
      <div>Institution</div>
      <div>Account</div>
      <div />
      <TitleStub />
    </div>
  );
};

export default PendingTitles;
