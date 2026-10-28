import React, {
  useEffect, useState,
} from 'react';
import CategorySplitItem from './CategorySplitItem';
import { useStores } from './State/Store';
import { addMoneyCents, formatMoneyCents, parseMoneyCents, subtractMoneyCents, type MoneyCents } from '../common/moneyCents';
import { inputMoneyCents } from './monetary';
import { TransactionCategoryInterface } from './State/Types';

export type CategorySplitInput = Omit<TransactionCategoryInterface, 'amount'> & { amount: string };

export const sumSplitCents = (splits: readonly CategorySplitInput[]): MoneyCents => (
  addMoneyCents(...splits.map(split => inputMoneyCents(split.amount)))
);

function* creatNextIdGen(): Generator<number, number> {
  let id = -1;
  for (;;) {
    yield id;
    id -= 1;
  }
}

const nextIdGen = creatNextIdGen();
const nextId = (): number => nextIdGen.next().value;

interface PropsType {
  splits: CategorySplitInput[],
  onChange: (
    splits: CategorySplitInput[]
  ) => void,
  total: MoneyCents,
  credit?: boolean,
}

const CategorySplits: React.FC<PropsType> = ({
  splits,
  onChange,
  total,
  credit = true,
}) => {
  const { categoryTree } = useStores();

  if (!categoryTree.unassignedCat) {
    throw new Error('unassigned category is null');
  }

  const [editedSplits, setEditedSplits] = useState<CategorySplitInput[]>(
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
          amount: credit ? s.amount : formatMoneyCents(subtractMoneyCents(parseMoneyCents('0.00'), inputMoneyCents(s.amount))),
        };
      })
      : [{
        id: nextId(), categoryId: categoryTree.unassignedCat.id, amount: formatMoneyCents(total),
      }],
  );

  useEffect(() => {
    if (splits.length === 0 && categoryTree.unassignedCat) {
      setEditedSplits([{
        id: nextId(), categoryId: categoryTree.unassignedCat.id, amount: formatMoneyCents(total),
      }]);
    }
  }, [categoryTree.unassignedCat, splits.length, total])

  const handleChange = (id: number, amount: string) => {
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
      let amount: string;
      try { amount = formatMoneyCents(subtractMoneyCents(total, sumSplitCents(editedSplits))); }
      catch { return; } // Leave invalid edits visible for form validation.

      const newSplits = editedSplits.slice();
      newSplits.splice(
        index + 1,
        0,
        {
          id: nextId(), categoryId: categoryTree.unassignedCat.id, amount,
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
          onAmountChange={handleChange}
          onCategoryChange={handleCategoryChange}
          onCommentChange={handleCommentChange}
        />
      ))}
    </div>
  );
};

export default CategorySplits;
