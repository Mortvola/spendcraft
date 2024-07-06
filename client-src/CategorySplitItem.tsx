import React from 'react';
import CategoryInput from './CategoryInput/CategoryInput';
import IconButton from './IconButton';
import AmountInput from './AmountInput';
import { CategoryInterface, TransactionCategoryInterface } from './State/Types';
import styles from './CategorySplitItem.module.scss';
import useMediaQuery from './MediaQuery';
import { useStores } from './State/Store';

type PropsType = {
  split: TransactionCategoryInterface,
  onCategoryChange: (id: number, categoryId: number) => void,
  onDeltaChange: (id: number, amount: number, delta: number) => void,
  onAddItem: (afterId: number) => void,
  onDeleteItem: (id: number) => void,
  onCommentChange: (id: number, comment: string) => void,
}

const CategorySplitItem: React.FC<PropsType> = ({
  split,
  onCategoryChange,
  onDeltaChange,
  onAddItem,
  onDeleteItem,
  onCommentChange,
}) => {
  const { categoryTree: { unassignedCat } } = useStores();
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

  return (
    <div className={styles.transactionSplitItem}>
      <div>
        <CategoryInput
          className="category-input"
          onCategoryChange={handleCategoryChange}
          categoryId={categoryId === unassignedCat.id ? null : categoryId}
        />
        <AmountInput onDeltaChange={handleDeltaChange} value={split.amount} style={{ margin: '1px' }} />
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
