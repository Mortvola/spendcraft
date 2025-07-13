import React from 'react';
import Amount from '../Amount';
import Date from '../Date';
import { BalanceInterface } from '../State/Types';
import styles from './Balance.module.scss';
import { observer } from 'mobx-react-lite';

interface PropsType {
  balance: BalanceInterface,
  showBalanceDialog: (balance: BalanceInterface) => void,
}

const Balance: React.FC<PropsType> = observer(({
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
})

export default Balance;
