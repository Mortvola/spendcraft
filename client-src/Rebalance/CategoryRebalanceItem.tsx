import React from 'react';
import AmountInput from '../AmountInput';
import Amount from '../Amount';
import styles from './CategoryRebalanceItem.module.scss';

interface PropsType {
  category: { name: string, balance: number, adjustment: number },
  onDeltaChange?: ((amunt: number, delta: number) => void),
  style?: React.CSSProperties
}

const CategoryRebalanceItem: React.FC<PropsType> = ({
  category,
  onDeltaChange,
  style,
}) => (
  <div className={styles.catRebalanceItem}>
    <div style={style}>{category.name}</div>
    <Amount amount={category.balance} />
    <AmountInput value={category.adjustment} onDeltaChange={onDeltaChange} />
    <Amount amount={category.balance + category.adjustment} />
  </div>
);

export default CategoryRebalanceItem;
