import React, {
  ReactElement, useContext, useEffect, useState,
} from 'react';
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
  splits: TransactionCategoryInterface[],
  onChange: (
    splits: TransactionCategoryInterface[]
  ) => void,
  total: number,
  credit?: boolean,
}

const CategorySplits = ({
  splits,
  onChange,
  total,
  credit = true,
}: PropsType): ReactElement => {
  const { categoryTree } = useContext(MobxStore);

  if (!categoryTree.unassignedCat) {
    throw new Error('unassigned category is null');
  }

  const [editedSplits, setEditedSplits] = useState<TransactionCategoryInterface[]>(
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
      : [{
        id: nextId(), type: 'REGULAR', categoryId: categoryTree.unassignedCat.id, amount: total,
      }],
  );

  useEffect(() => {
    if (splits.length === 0 && categoryTree.unassignedCat) {
      setEditedSplits([{
        id: nextId(), type: 'REGULAR', categoryId: categoryTree.unassignedCat.id, amount: total,
      }]);
    }
  }, [categoryTree.unassignedCat, splits.length, total])

  const handleChange = (id: number, amount: number) => {
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

  const handleCommentChange = (id: number, comment: string) => {
    const splitIndex = editedSplits.findIndex((s) => s.id === id);

    if (splitIndex !== -1) {
      const newSplits = [
        ...editedSplits.slice(0, splitIndex),
        { ...editedSplits[splitIndex], comment },
        ...editedSplits.slice(splitIndex + 1),
      ];

      setEditedSplits(newSplits);
      onChange(newSplits);
    }
  }

  const handleAddItem = (afterId: number) => {
    if (!categoryTree.unassignedCat) {
      throw new Error('unassigned category is null');
    }

    const index = editedSplits.findIndex((s) => s.id === afterId);

    if (index !== -1) {
      const sum = editedSplits.reduce((accum, item) => accum + item.amount, 0);
      const amount = total - sum;

      const newSplits = editedSplits.slice();
      newSplits.splice(
        index + 1,
        0,
        {
          id: nextId(), type: 'REGULAR', categoryId: categoryTree.unassignedCat.id, amount,
        },
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
        newSplits.splice(index, 1);

        setEditedSplits(newSplits);
        onChange(newSplits);
      }
    }
  };

  return (
    <div className="transaction-split-items">
      {editedSplits.map((s) => (
        <CategorySplitItem
          key={s.id}
          split={s}
          onAddItem={handleAddItem}
          onDeleteItem={handleDeleteItem}
          onDeltaChange={handleChange}
          onCategoryChange={handleCategoryChange}
          onCommentChange={handleCommentChange}
        />
      ))}
    </div>
  );
};

export default CategorySplits;
