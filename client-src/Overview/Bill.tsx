import React from 'react';
import Amount from '../Amount';
import Date from '../Date';
import { BillInterface } from '../State/Types';
import styles from './Bill.module.scss';

interface PropsType {
  bill: BillInterface,
}

const Bill: React.FC<PropsType> = ({
  bill,
}) => (
  <div key={bill.id} className={styles.layout}>
    <div className="ellipsis">{bill.name}</div>
    <Amount amount={bill.amount} />
    <Date date={bill.date} />
    <Amount amount={bill.debits} noValue="" />
  </div>
)

export default Bill;
