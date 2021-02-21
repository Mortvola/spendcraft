import React from 'react';
import PropTypes from 'prop-types';
import CategoryInput from './CategoryInput/CategoryInput';
import IconButton from './IconButton';
import AmountInput from './AmountInput';
import Amount from './Amount';

function CategorySplitItem({
  split,
  balance,
  credit,
  onCategoryChange,
  onDeltaChange,
  onAddItem,
  onDeleteItem,
  showBalances,
}) {
  const handleCategoryChange = (categoryId) => {
    onCategoryChange(split.id, categoryId);
  };

  const handleDeltaChange = (amount, delta) => {
    onDeltaChange(split.id, amount, delta);
  };

  const handleAddItem = () => {
    onAddItem(split.id);
  };

  const handleDeleteItem = () => {
    onDeleteItem(split.id);
  };

  const categoryId = split ? split.categoryId : null;
  let newBalance = null;
  if (balance !== null) {
    if (credit) {
      newBalance = balance + split.amount;
    }
    else {
      newBalance = balance - split.amount;
    }
  }

  const renderBalances = () => {
    if (showBalances) {
      return (
        <>
          <Amount amount={balance} />
          <Amount amount={newBalance} />
        </>
      );
    }

    return null;
  };

  let className = 'transaction-split-item';
  if (!showBalances) {
    className += ' no-balances';
  }

  return (
    <div className={className}>
      <CategoryInput onChange={handleCategoryChange} categoryId={categoryId} />
      <AmountInput onDeltaChange={handleDeltaChange} name="amount" amount={split.amount} />
      {renderBalances()}
      <IconButton icon="plus" onClick={handleAddItem} />
      <IconButton icon="minus" onClick={handleDeleteItem} />
    </div>
  );
}

CategorySplitItem.propTypes = {
  split: PropTypes.shape(),
  balance: PropTypes.number,
  credit: PropTypes.bool,
  onAddItem: PropTypes.func.isRequired,
  onDeleteItem: PropTypes.func.isRequired,
  onDeltaChange: PropTypes.func.isRequired,
  onCategoryChange: PropTypes.func.isRequired,
  showBalances: PropTypes.bool.isRequired,
};

CategorySplitItem.defaultProps = {
  split: null,
  balance: null,
  credit: false,
};

export default CategorySplitItem;
