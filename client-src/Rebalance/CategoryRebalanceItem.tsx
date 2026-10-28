import React from 'react';
import AmountInput from '../AmountInput';
import MoneyCentsAmount from '../MoneyCentsAmount';
import { addMoneyCents, type MoneyCents } from '../../common/moneyCents';
import { inputMoneyCents } from '../monetary';
import styles from './CategoryRebalanceItem.module.scss';

interface PropsType {
  category: { name: string, balanceCents: MoneyCents, adjustment: string },
  onChange: (amount: string) => void,
  style?: React.CSSProperties
}

const CategoryRebalanceItem: React.FC<PropsType> = ({
  category,
  onChange,
  style,
}) => {
  let balance: MoneyCents | null = null;
  try { balance = addMoneyCents(category.balanceCents, inputMoneyCents(category.adjustment)); }
  catch { /* Keep invalid edits visible without displaying a false balance. */ }
  return (
    <div className={styles.catRebalanceItem}>
      <div style={style}>{category.name}</div>
      <MoneyCentsAmount amount={category.balanceCents} />
      <AmountInput exactCents value={category.adjustment} onValueChange={onChange} />
      {balance === null ? <div>Invalid amount</div> : <MoneyCentsAmount amount={balance} />}
    </div>
  );
};

export default CategoryRebalanceItem;
