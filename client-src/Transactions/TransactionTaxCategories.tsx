import React, {
  useEffect, useState,
} from 'react';
import { useStores } from '../State/Store';
import { TransactionTaxCategoryInterface } from '../State/Types';
import TransactionTaxCategory from './TransactionTaxCategory';
import styles from './TransactionTaxCategories.module.scss';
import { addMoneyCents, type MoneyCents } from '../../common/moneyCents';
import { inputMoneyCents } from '../monetary';

export type TransactionTaxInput = Omit<TransactionTaxCategoryInterface, 'amountCents'> & {
  amount: string };

export const sumTaxCents = (taxCategories: readonly TransactionTaxInput[]): MoneyCents => (
  addMoneyCents(...taxCategories.map(tax => inputMoneyCents(tax.amount)))
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
  taxCategories: TransactionTaxInput[],
  onChange: (
    splits: TransactionTaxInput[]
  ) => void,
}

const TransactionTaxCategories: React.FC<PropsType> = ({
  taxCategories,
  onChange,
}) => {
  const { categoryTree } = useStores();

  if (!categoryTree.unassignedCat) {
    throw new Error('unassigned category is null');
  }

  const [editedSplits, setEditedSplits] = useState<TransactionTaxInput[]>(
    taxCategories && taxCategories.length > 0
      ? taxCategories.map((s) => {
        if (s.id === undefined) {
          return {
            ...s,
            id: nextId(),
          };
        }

        return s
      })
      : [{
        id: nextId(),
        type: '',
        amount: '0.00',
      }],
  );

  useEffect(() => {
    if (taxCategories.length === 0) {
      setEditedSplits([{
        id: nextId(),
        type: '',
        amount: '0.00',
      }]);
    }
  }, [taxCategories])

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

  const handleCategoryChange = (id: number, newType: string) => {
    const splitIndex = editedSplits.findIndex((s) => s.id === id);

    if (splitIndex !== -1) {
      const newSplits = [
        ...editedSplits.slice(0, splitIndex),
        { ...editedSplits[splitIndex], type: newType },
        ...editedSplits.slice(splitIndex + 1),
      ];

      setEditedSplits(newSplits);
      onChange(newSplits);
    }
  };

  const handleAddItem = (afterId: number) => {
    const index = editedSplits.findIndex((s) => s.id === afterId);

    if (index !== -1) {
      const newSplits = editedSplits.slice();
      newSplits.splice(
        index + 1,
        0,
        {
          id: nextId(), type: '', amount: '0.00',
        },
      );

      setEditedSplits(newSplits);
      onChange(newSplits);
    }
  };

  const handleDeleteItem = (id: number) => {
    const index = editedSplits.findIndex((s) => s.id === id);

    if (index !== -1) {
      let newSplits = editedSplits.slice();
      newSplits.splice(index, 1);

      if (newSplits.length === 0) {
        newSplits = [{ id: nextId(), type: '', amount: '0.00' }]
      }

      setEditedSplits(newSplits);
      onChange(newSplits);
    }
  };

  return (
    <>
      <div className={styles.transactionSplitItem}>
        <div>
          <div className="item-title">Tax Category</div>
          <div className="item-title-amount">Amount</div>
          {
            // !isMobile
            //   ? <div className="item-title">Comment</div>
            //   : null
          }
        </div>
      </div>

      <div className="transaction-split-items">
        {
          editedSplits.map((s) => (
            <TransactionTaxCategory
              key={s.id}
              split={s}
              onAddItem={handleAddItem}
              onDeleteItem={handleDeleteItem}
              onAmountChange={handleChange}
              onCategoryChange={handleCategoryChange}
            />
          ))
        }
      </div>
    </>
  );
};

export default TransactionTaxCategories;
