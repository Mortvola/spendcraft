import React from 'react';
import { observer } from 'mobx-react-lite';
import { DateTime } from 'luxon';
import MoneyCentsAmount from '../MoneyCentsAmount';
import type { MoneyCents } from '../../common/moneyCents';
import Date from '../Date';
import styles from './Balance.module.scss';

interface PropsType {
  id: number,
  balance: MoneyCents,
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
    onClick()
  }

  return (
    <div key={id} className={styles.balance} onClick={handleClick}>
      <Date date={date} />
      <MoneyCentsAmount amount={balance} />
    </div>
  )
})

export default Balance;
