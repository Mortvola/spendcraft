import React from 'react';
import TitleStub from './TitleStub';
import styles from './Transactions.module.scss';

const RebalancesTitles: React.FC = () => (
  <div className={`${styles.registerTitle} ${styles.rebalances} ${styles.transaction}`}>
    <div />
    <div>Date</div>
    <div className="currency">Amount</div>
    <TitleStub />
  </div>
);

export default RebalancesTitles;
