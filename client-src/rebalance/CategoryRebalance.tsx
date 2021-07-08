import React, { ReactElement, useState } from 'react';
import CategoryRebalanceItem from './CategoryRebalanceItem';
import { RebalanceCategoryInterface, CategoryBalanceInterface, CategoryTreeBalanceInterace } from '../state/State';

interface Props {
  categoryTree: null | CategoryTreeBalanceInterace[],
  onDeltaChange: null | ((amunt: number, delta: number, categories: unknown) => void),
  categories: RebalanceCategoryInterface[],
}

const CategoryRebalance = ({
  categoryTree,
  categories,
  onDeltaChange,
}: Props): ReactElement => {
  const [cats, setCats] = useState(categories);

  const handleDeltaChange = (amount: number, delta: number, categoryId: number) => {
    const categoriesCopy = cats.slice();
    const index = cats.findIndex((c) => c.categoryId === categoryId);

    if (index === -1) {
      if (amount !== 0) {
        categoriesCopy.splice(-1, 0, { categoryId, amount });
        setCats(categoriesCopy);
      }
    }
    else if (amount === 0) {
      // Remove category
      categoriesCopy.splice(index, 1);
      setCats(categoriesCopy);
    }
    else {
      categoriesCopy[index].amount = amount;
      setCats(categoriesCopy);
    }

    if (onDeltaChange) {
      onDeltaChange(amount, delta, categoriesCopy);
    }
  };

  const populateCategories = (group: CategoryBalanceInterface[]) => {
    const catItems: unknown[] = [];

    if (group) {
      group.forEach((category: CategoryBalanceInterface) => {
        let adjustment = 0;
        const catAmount = cats.find((c) => c.categoryId === category.id);
        if (catAmount) {
          adjustment = catAmount.amount;
        }

        catItems.push((
          <CategoryRebalanceItem
            key={category.id}
            category={{ name: category.name, balance: category.balance, adjustment }}
            onDeltaChange={(amount: number, delta: number) => (
              handleDeltaChange(amount, delta, category.id)
            )}
          />
        ));
      });
    }

    return catItems;
  };

  const populateTree = (tree: CategoryTreeBalanceInterace[] | null) => {
    const groups: unknown[] = [];

    if (tree) {
      tree.forEach((group) => {
        groups.push((
          <div key={group.id}>
            {group.name}
            {populateCategories(group.categories)}
          </div>
        ));
      });
    }

    return groups;
  };

  return (
    <div className="cat-rebalance-container">
      {populateTree(categoryTree)}
    </div>
  );
};

export default CategoryRebalance;
