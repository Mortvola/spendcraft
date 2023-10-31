import React from 'react';
import styles from './TransactionTypeSelector.module.scss';

type PropsType = {
  state: boolean,
  onClick: (state: boolean) => void,
}

const TransactionTypeSelector: React.FC<PropsType> = ({
  state,
  onClick,
}) => {
  const handleClick1 = () => {
    onClick(false);
  }

  const handleClick2 = () => {
    onClick(true);
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.outer}>
        <div className={`${styles.slider} ${state ? 'on' : ''}`} />
        <div className={styles.inner}>
          <div className={styles.label} onClick={handleClick1}>Posted Trnansactions</div>
          <div className={styles.label} onClick={handleClick2}>Pending Transactions</div>
        </div>
      </div>
    </div>
  )
};

export default TransactionTypeSelector;
