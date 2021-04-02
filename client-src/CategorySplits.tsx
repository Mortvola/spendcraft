import React, { ReactElement, useContext, useState } from 'react';
import CategorySplitItem from './CategorySplitItem';
import MobxStore from './state/mobxStore';
import { TransactionCategoryInterface } from './state/State';

function* creatNextIdGen(): Generator<number, number> {
  let id = -1;
  for (;;) {
    yield id;
    id -= 1;
  }
}

const nextIdGen = creatNextIdGen();
const nextId = (): number => nextIdGen.next().value;

type PropsType = {
  splits: Array<TransactionCategoryInterface>,
  onChange: (
    splits: Array<TransactionCategoryInterface | { id: number, categoryId: number, amount: number }>
  ) => void,
  total: number,
  credit?: boolean,
  showBalances?: boolean,
}

const CategorySplits = ({
  splits,
  onChange,
  total,
  credit,
  showBalances,
}: PropsType): ReactElement => {
  const { categoryTree } = useContext(MobxStore);

  const [editedSplits, setEditedSplits] = useState<Array<
    TransactionCategoryInterface | { id: number, categoryId: number, amount: number }
  >>(
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
      : [{ id: nextId(), categoryId: categoryTree.systemIds.unassignedId, amount: total }],
  );

  const handleDeltaChange = (id: number, amount: number, delta: number) => {
    const splitIndex = editedSplits.findIndex((s) => s.id === id);

    if (splitIndex !== -1) {
      const newSplits = [
        ...editedSplits.slice(0, splitIndex),
        { ...editedSplits[splitIndex], amount },
        ...editedSplits.slice(splitIndex + 1),
      ];

      setEditedSplits(newSplits);
      onChange(newSplits);
    }
  };

  const handleCategoryChange = (id: number, categoryId: number) => {
    const splitIndex = editedSplits.findIndex((s) => s.id === id);

    if (splitIndex !== -1) {
      const newSplits = [
        ...editedSplits.slice(0, splitIndex),
        { ...editedSplits[splitIndex], categoryId },
        ...editedSplits.slice(splitIndex + 1),
      ];

      setEditedSplits(newSplits);
      onChange(newSplits);
    }
  };

  const handleAddItem = (afterId: number) => {
    const index = editedSplits.findIndex((s) => s.id === afterId);

    if (index !== -1) {
      const sum = editedSplits.reduce((accum, item) => accum + item.amount, 0);
      const amount = total - sum;

      const newSplits = editedSplits.slice();
      newSplits.splice(
        index + 1,
        0,
        { id: nextId(), categoryId: categoryTree.systemIds.unassignedId, amount },
      );

      setEditedSplits(newSplits);
      onChange(newSplits);
    }
  };

  const handleDeleteItem = (id: number) => {
    if (editedSplits.length > 1) {
      const index = editedSplits.findIndex((s) => s.id === id);

      if (index !== -1) {
        const newSplits = editedSplits.slice();
        const { amount } = newSplits[index];
        newSplits.splice(index, 1);

        setEditedSplits(newSplits);
        onChange(newSplits);
      }
    }
  };

  const getCategoryBalance = (categoryId: number) => {
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

CategorySplits.defaultProps = {
  showBalances: false,
  credit: false,
};

export default CategorySplits;
