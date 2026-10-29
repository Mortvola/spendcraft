import React from 'react';
import { Minus, Plus } from 'lucide-react';
import AmountInput from '../AmountInput';
import type { TransactionTaxInput } from './TransactionTaxCategories';
import styles from './TransactionTaxCategories.module.scss';
import { useStores } from '../State/Store';
import LucideButton from '../LucideButton';

interface PropsType {
  split: TransactionTaxInput,
  onCategoryChange: (id: number, newType: string) => void,
  onAmountChange: (id: number, amount: string) => void,
  onAddItem: (afterId: number) => void,
  onDeleteItem: (id: number) => void,
}

const TransactionTaxCategory: React.FC<PropsType> = ({
  split,
  onCategoryChange,
  onAmountChange,
  onAddItem,
  onDeleteItem,
}) => {
  const { taxCategories } = useStores();

  const handleCategoryChange: React.ChangeEventHandler<HTMLSelectElement> = (event) => {
    if (split.id === undefined) {
      throw new Error('missing id');
    }
    onCategoryChange(split.id, event.target.value);
  };

  const handleAmountChange = (amount: string) => {
    if (split.id === undefined) {
      throw new Error('missing id');
    }
    onAmountChange(split.id, amount);
  };

  const handleAddItem = () => {
    if (split.id === undefined) {
      throw new Error('missing id');
    }
    onAddItem(split.id);
  };

  const handleDeleteItem = () => {
    if (split.id === undefined) {
      throw new Error('missing id');
    }
    onDeleteItem(split.id);
  };

  return (
    <div className={styles.transactionSplitItem}>
      <div>
        <select value={split.type} onChange={handleCategoryChange}>
          <option value=""></option>
          {
            taxCategories.taxCategories.map((taxcat) => (
              <option value={taxcat.type}>{taxcat.description}</option>
            ))
          }
        </select>
        <AmountInput exactCents onValueChange={handleAmountChange} value={split.amount} style={{
          margin: '1px' }} />
      </div>
      <LucideButton onClick={handleAddItem}>
        <Plus size={16} strokeWidth={2.5} />
      </LucideButton>
      <LucideButton onClick={handleDeleteItem}>
        <Minus size={16} strokeWidth={2.5} />
      </LucideButton>
    </div>
  );
}

export default TransactionTaxCategory;
