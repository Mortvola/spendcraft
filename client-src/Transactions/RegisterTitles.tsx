import React, { ReactElement } from 'react';
import useMediaQuery from '../MediaQuery';
import { CategoryInterface } from '../State/State';
import TitleStub from './TitleStub';
import styles from './Transactions.module.css';

type PropsType = {
  category?: CategoryInterface | null,
}

const RegisterTitles = ({
  category = null,
}: PropsType): ReactElement => {
  const { isMobile } = useMediaQuery();

  if (isMobile) {
    return (
      <div className={`mobile register-title ${styles.transaction}`}>
        <div />
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

  if (category) {
    let className = `register-title ${styles.transaction}`;
    if (category.type === 'UNASSIGNED') {
      className += ` ${styles.unassigned}`;
    }

    return (
      <div className={className}>
        {commonTitles()}
        {
          category.type === 'UNASSIGNED'
            ? null
            : <div className="currency">Trx Amount</div>
        }
        <div className="currency">Amount</div>
        <div className="currency">Balance</div>
        <div>Institution</div>
        <div>Account</div>
        <TitleStub />
      </div>
    );
  }

  return (
    <div className={`register-title ${styles.acct} ${styles.transaction}`}>
      {commonTitles()}
      <div className="currency">Amount</div>
      <div className="currency">Balance</div>
      <div />
      <TitleStub />
    </div>
  );
};

export default RegisterTitles;
