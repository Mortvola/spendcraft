import React from 'react';
import TitleStub from './TitleStub';
import styles from './Transactions.module.css';

const RebalancesTitles: React.FC = () => (
  <div className={`register-title ${styles.rebalances} ${styles.transaction}`}>
    <div />
    <div>Date</div>
    <div className="currency">Amount</div>
    <TitleStub />
  </div>
);

export default RebalancesTitles;
