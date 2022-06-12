import React from 'react';
import useMediaQuery from '../MediaQuery';
import { AccountInterface, CategoryInterface } from '../State/State';
import TitleStub from './TitleStub';
import styles from './Transactions.module.css';

type PropsType = {
  category?: CategoryInterface | null,
  account?: AccountInterface | null,
}

const RegisterTitles: React.FC<PropsType> = ({
  category = null,
  account = null,
}) => {
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

  let className = `register-title ${styles.acct} ${styles.transaction}`;
  if (account && account.type === 'loan') {
    className += ` ${styles.loan}`;
  }
  else {
    className += ` ${styles.acct}`;
  }

  return (
    <div className={className}>
      {commonTitles()}
      <div className="currency">Amount</div>
      {
        account && account.type === 'loan'
          ? (
            <>
              <div className="currency">Interest</div>
              <div className="currency">Principle</div>
            </>
          )
          : null
      }
      <div className="currency">Balance</div>
      <div />
      <TitleStub />
    </div>
  );
};

export default RegisterTitles;
