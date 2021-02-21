import React, { useContext, useState } from 'react';
import PropTypes from 'prop-types';
import CategorySplitItem from './CategorySplitItem';
import MobxStore from './state/mobxStore';

function* creatNextIdGen() {
  let id = -1;
  for (;;) {
    yield id;
    id += -1;
  }
}

const nextIdGen = creatNextIdGen();
const nextId = () => nextIdGen.next().value;

const CategorySplits = ({
  splits,
  onChange,
  total,
  credit,
  showBalances,
}) => {
  const { categoryTree } = useContext(MobxStore);
  const [editedSplits, setEditedSplits] = useState(
    splits && splits.length > 0
      ? splits.map((s) => {
        if (s.id === undefined) {
          return {
            ...s,
            id: nextId(),
          };
        }

        return {
          ...s,
          amount: (credit ? s.amount : -s.amount),
        };
      })
      : [{ id: nextId(), amount: total }],
  );

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
      newSplits.splice(index + 1, 0, { id: nextId(), amount });

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
    const category = categoryTree.getCategory(categoryId);

    if (category) {
      return category.balance;
    }

    return 0;
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
  splits: PropTypes.arrayOf(PropTypes.shape()),
  total: PropTypes.number.isRequired,
  credit: PropTypes.bool,
  showBalances: PropTypes.bool,
};

CategorySplits.defaultProps = {
  splits: [],
  showBalances: false,
  credit: false,
};

export default CategorySplits;
