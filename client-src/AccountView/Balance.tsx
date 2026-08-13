import React from 'react';
import { observer } from 'mobx-react-lite';
import { DateTime } from 'luxon';
import Amount from '../Amount';
import Date from '../Date';
import styles from './Balance.module.scss';

interface PropsType {
  id: number,
  balance: number,
  date: DateTime,
  onClick: () => void,
}

const Balance: React.FC<PropsType> = observer(({
  id,
  balance,
  date,
  onClick,
}) => {
  const handleClick = () => {
    // showBalanceDialog(balance);
    onClick()
  }

  return (
    <div key={id} className={styles.balance} onClick={handleClick}>
      <Date date={date} />
      <Amount amount={balance} />
    </div>
  )
})

export default Balance;
