import React, { ReactElement } from 'react';
import Amount from '../Amount';
import Date from '../Date';
import { BalanceInterface } from '../State/State';
import styles from './Balance.module.css';

type PropsType = {
  balance: BalanceInterface,
  showBalanceDialog: (balance: BalanceInterface) => void,
}
const Balance = ({
  balance,
  showBalanceDialog,
}: PropsType): ReactElement => {
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
