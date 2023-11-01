import React from 'react';
import useMediaQuery from '../MediaQuery';
import { AccountInterface, CategoryInterface } from '../State/State';
import TitleStub from './TitleStub';
import styles from './Transactions.module.scss';

type PropsType = {
  category?: CategoryInterface | null,
  account?: AccountInterface | null,
  transactionClassName?: string,
}

const RegisterTitles: React.FC<PropsType> = ({
  category = null,
  account = null,
  transactionClassName,
}) => {
  const { isMobile } = useMediaQuery();

  const commonTitles = () => (
    <>
      <div />
      <div>Date</div>
      <div>Name</div>
    </>
  );

  if (isMobile) {
    return (
      <div className={`${styles.registerTitle} ${styles.transaction}`}>
        { commonTitles() }
        <div className="currency">Amount</div>
      </div>
    );
  }

  const className = `${styles.registerTitle} ${styles.transaction} ${transactionClassName ?? ''}`;

  if (category) {
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
      <div>C</div>
      <div>Owner</div>
      <TitleStub />
    </div>
  );
};

export default RegisterTitles;
