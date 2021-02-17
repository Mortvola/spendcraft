import React, { useContext, useState } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import CategorySplitItem from './CategorySplitItem';
import MobxStore from './redux/mobxStore';

let nextId = -1;

const CategorySplits = ({
  splits,
  onChange,
  total,
  credit,
  showBalances,
}) => {
  const { categoryTree: { groups } } = useContext(MobxStore);
  const [editedSplits, setEditedSplits] = useState(splits.map((s) => {
    if (s.id === undefined) {
      const id = nextId;
      nextId -= 1;

      return {
        ...s,
        id,
      };
    }

    return s;
  }));

  const handleDeltaChange = (id, amount, delta) => {
    const splitIndex = editedSplits.findIndex((s) => s.id === id);

    if (splitIndex !== -1) {
      const newSplits = [
        ...editedSplits.slice(0, splitIndex),
        { ...editedSplits[splitIndex], amount },
        ...editedSplits.slice(splitIndex + 1),
      ];

      setEditedSplits(newSplits);
      onChange(newSplits, -delta);
    }
  };

  const handleCategoryChange = (id, categoryId) => {
    const splitIndex = editedSplits.findIndex((s) => s.id === id);

    if (splitIndex !== -1) {
      const newSplits = [
        ...editedSplits.slice(0, splitIndex),
        { ...editedSplits[splitIndex], categoryId },
        ...editedSplits.slice(splitIndex + 1),
      ];

      setEditedSplits(newSplits);
      onChange(newSplits, 0);
    }
  };

  const handleAddItem = (afterId) => {
    const index = editedSplits.findIndex((s) => s.id === afterId);

    if (index !== -1) {
      const sum = editedSplits.reduce((accum, item) => accum + item.amount, 0);
      const amount = total - sum;

      const newSplits = editedSplits.slice();
      newSplits.splice(index + 1, 0, { id: nextId, amount });
      nextId -= 1;

      setEditedSplits(newSplits);
      onChange(newSplits, -amount);
    }
  };

  const handleDeleteItem = (id) => {
    if (editedSplits.length > 1) {
      const index = editedSplits.findIndex((s) => s.id === id);

      if (index !== -1) {
        const newSplits = editedSplits.slice();
        const { amount } = newSplits[index];
        newSplits.splice(index, 1);

        setEditedSplits(newSplits);
        onChange(newSplits, amount);
      }
    }
  };

  const getCategoryBalance = (categoryId) => {
    let balance = null;

    groups.find((group) => {
      const category = group.categories.find((cat) => cat.id === categoryId);

      if (category) {
        balance = category.amount;
        return true;
      }

      return false;
    });

    return balance;
  };

  return (
    <div className="transaction-split-items">
      {editedSplits.map((s) => {
        const currentBalance = getCategoryBalance(s.categoryId);
        return (
          <CategorySplitItem
            key={s.id}
            split={s}
            balance={currentBalance}
            onAddItem={handleAddItem}
            onDeleteItem={handleDeleteItem}
            onDeltaChange={handleDeltaChange}
            onCategoryChange={handleCategoryChange}
            showBalances={showBalances}
            credit={credit}
          />
        );
      })}
    </div>
  );
};

CategorySplits.propTypes = {
  onChange: PropTypes.func.isRequired,
  splits: PropTypes.arrayOf(PropTypes.shape()).isRequired,
  total: PropTypes.number.isRequired,
  credit: PropTypes.bool,
  showBalances: PropTypes.bool,
};

CategorySplits.defaultProps = {
  showBalances: false,
  credit: false,
};

export default CategorySplits;
