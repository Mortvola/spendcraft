import React, { ReactElement, useContext, useState } from 'react';
import CategoryInput from './CategoryInput/CategoryInput';
import IconButton from './IconButton';
import AmountInput from './AmountInput';
import { CategoryInterface, TransactionCategoryInterface } from './state/State';
import MobxStore from './state/mobxStore';

type PropsType = {
  split: TransactionCategoryInterface,
  balance?: number | null,
  credit?: boolean,
  onCategoryChange: (id: number, categoryId: number) => void,
  onDeltaChange: (id: number, amount: number, delta: number) => void,
  onAddItem: (afterId: number) => void,
  onDeleteItem: (id: number) => void,
  onCommentChange: (id: number, comment: string) => void,
}

function CategorySplitItem({
  split,
  balance = null,
  credit = false,
  onCategoryChange,
  onDeltaChange,
  onAddItem,
  onDeleteItem,
  onCommentChange,
}: PropsType): ReactElement {
  const { categoryTree: { unassignedCat } } = useContext(MobxStore);

  if (!unassignedCat) {
    throw new Error('unassigned category is null');
  }

  const handleCategoryChange = (category: CategoryInterface) => {
    onCategoryChange(split.id, category.id);
  };

  const handleDeltaChange = (amount: number, delta: number) => {
    onDeltaChange(split.id, amount, delta);
  };

  const handleCommentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onCommentChange(split.id, event.target.value);
  }

  const handleAddItem = () => {
    onAddItem(split.id);
  };

  const handleDeleteItem = () => {
    onDeleteItem(split.id);
  };

  const categoryId = split ? split.categoryId : null;
  let newBalance: number | null = null;
  if (balance !== null) {
    if (credit) {
      newBalance = balance + split.amount;
    }
    else {
      newBalance = balance - split.amount;
    }
  }

  let className = 'transaction-split-item no-balances';

  return (
    <div className={className}>
      <CategoryInput
        onChange={handleCategoryChange}
        categoryId={categoryId === unassignedCat.id ? null : categoryId}
      />
      <AmountInput onDeltaChange={handleDeltaChange} value={split.amount} />
      <input type="text" value={split.comment ?? ''} onChange={handleCommentChange}/>
      <IconButton icon="plus" onClick={handleAddItem} />
      <IconButton icon="minus" onClick={handleDeleteItem} />
    </div>
  );
}

export default CategorySplitItem;
