import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../../Amount';
import styles from '../Transactions.module.scss';

type PropsType = {
  amount: number,
}

const RebalanceTransaction: React.FC<PropsType> = observer(({
  amount,
}) => (
  <Amount className={`currency`} amount={amount} />
));

export default RebalanceTransaction;
