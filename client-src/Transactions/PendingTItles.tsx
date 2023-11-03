import React from 'react';
import useMediaQuery from '../MediaQuery';
import TitleStub from './TitleStub';
import styles from './Transactions.module.scss';

type PropsType = {
  categoryView?: boolean,
}

const PendingTitles: React.FC<PropsType> = ({
  categoryView = false,
}) => {
  const { isMobile } = useMediaQuery();

  if (isMobile) {
    return (
      <div className={`${styles.registerTitle} ${styles.transaction}`}>
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
      <div className={`${styles.registerTitle} ${styles.transaction}`}>
        {commonTitles()}
        <div>Owner</div>
        <TitleStub />
      </div>
    );
  }

  return (
    <div className={`${styles.registerTitle} ${styles.transaction}`}>
      {commonTitles()}
      <div>Account</div>
      <TitleStub />
    </div>
  );
};

export default PendingTitles;
