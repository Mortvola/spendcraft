import React from 'react';
import { Minus, Plus } from 'lucide-react';
import AmountInput from '../AmountInput';
import { TransactionTaxCategoryInterface } from '../State/Types';
import styles from './TransactionTaxCategories.module.scss';
import { useStores } from '../State/Store';
import LucideButton from '../LucideButton';

interface PropsType {
  split: TransactionTaxCategoryInterface,
  onCategoryChange: (id: number, newType: string) => void,
  onDeltaChange: (id: number, amount: number, delta: number) => void,
  onAddItem: (afterId: number) => void,
  onDeleteItem: (id: number) => void,
}

const TransactionTaxCategory: React.FC<PropsType> = ({
  split,
  onCategoryChange,
  onDeltaChange,
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

  const handleDeltaChange = (amount: number, delta: number) => {
    if (split.id === undefined) {
      throw new Error('missing id');
    }
    onDeltaChange(split.id, amount, delta);
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
        <AmountInput onDeltaChange={handleDeltaChange} value={split.amount} style={{ margin: '1px' }} />
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
