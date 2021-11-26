import React, { ReactElement, useContext } from 'react';
import CategoryInput from './CategoryInput/CategoryInput';
import IconButton from './IconButton';
import AmountInput from './AmountInput';
import { CategoryInterface, TransactionCategoryInterface } from './State/State';
import MobxStore from './State/mobxStore';
import styles from './CategorySplitItem.module.css';
import useMediaQuery from './MediaQuery';

type PropsType = {
  split: TransactionCategoryInterface,
  onCategoryChange: (id: number, categoryId: number) => void,
  onDeltaChange: (id: number, amount: number, delta: number) => void,
  onAddItem: (afterId: number) => void,
  onDeleteItem: (id: number) => void,
  onCommentChange: (id: number, comment: string) => void,
}

function CategorySplitItem({
  split,
  onCategoryChange,
  onDeltaChange,
  onAddItem,
  onDeleteItem,
  onCommentChange,
}: PropsType): ReactElement {
  const { categoryTree: { unassignedCat } } = useContext(MobxStore);
  const { isMobile } = useMediaQuery();

  if (!unassignedCat) {
    throw new Error('unassigned category is null');
  }

  const handleCategoryChange = (category: CategoryInterface) => {
    if (split.id === undefined) {
      throw new Error('missing id');
    }
    onCategoryChange(split.id, category.id);
  };

  const handleDeltaChange = (amount: number, delta: number) => {
    if (split.id === undefined) {
      throw new Error('missing id');
    }
    onDeltaChange(split.id, amount, delta);
  };

  const handleCommentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (split.id === undefined) {
      throw new Error('missing id');
    }
    onCommentChange(split.id, event.target.value);
  }

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

  const categoryId = split ? split.categoryId : null;

  let className = styles.transactionSplitItem;
  if (isMobile) {
    className = `mobile ${className}`;
  }

  return (
    <div className={className}>
      <div>
        <CategoryInput
          onChange={handleCategoryChange}
          categoryId={categoryId === unassignedCat.id ? null : categoryId}
        />
        <AmountInput onDeltaChange={handleDeltaChange} value={split.amount} />
        <input
          type="text"
          className={styles.comment}
          value={split.comment ?? ''}
          onChange={handleCommentChange}
          placeholder={isMobile ? 'Comment' : ''}
        />
      </div>
      <IconButton icon="plus" onClick={handleAddItem} />
      <IconButton icon="minus" onClick={handleDeleteItem} />
    </div>
  );
}

export default CategorySplitItem;
