import React from 'react';
import Amount from '../Amount';
import Date from '../Date';
import { BalanceInterface } from '../State/State';
import styles from './Balance.module.scss';

type PropsType = {
  balance: BalanceInterface,
  showBalanceDialog: (balance: BalanceInterface) => void,
}

const Balance: React.FC<PropsType> = ({
  balance,
  showBalanceDialog,
}) => {
  const handleClick = () => {
    showBalanceDialog(balance);
  }

  return (
    <div key={balance.id} className={styles.balance} onClick={handleClick}>
      <Date date={balance.date} />
      <Amount amount={balance.balance} />
    </div>
  )
}

export default Balance;
