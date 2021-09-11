import React, { ReactElement, useState } from 'react';
import CategoryRebalanceItem from './CategoryRebalanceItem';
import { CategoryBalanceInterface, CategoryInterface, TransactionCategoryInterface } from '../state/State';
import { TreeNodeInterface } from '../state/CategoryTree';
import { isGroup } from '../state/Group';
import { isCategory } from '../state/Category';

interface Props {
  nodes: null | TreeNodeInterface[],
  onDeltaChange: null | ((amunt: number, delta: number, categories: unknown) => void),
  balances: CategoryBalanceInterface[],
  trxCategories: TransactionCategoryInterface[],
}

const CategoryRebalance = ({
  nodes,
  balances,
  trxCategories,
  onDeltaChange,
}: Props): ReactElement => {
  const [transactionCategories, setTransactionCategories] = useState<TransactionCategoryInterface[]>(trxCategories);

  const handleDeltaChange = (amount: number, delta: number, category: CategoryInterface) => {
    let categoriesCopy = null;
    const index = transactionCategories.findIndex((c) => c.categoryId === category.id);

    if (index === -1) {
      if (amount !== 0) {
        categoriesCopy = [
          ...transactionCategories,
          {
            categoryId: category.id,
            amount,
          },
        ];
      }
    }
    else if (amount === 0) {
      // Remove category
      categoriesCopy = [
        ...transactionCategories.slice(0, index),
        ...transactionCategories.slice(index + 1),
      ];
    }
    else {
      categoriesCopy = [
        ...transactionCategories.slice(0, index),
        {
          ...transactionCategories[index],
          amount,
        },
        ...transactionCategories.slice(index + 1),
      ];
    }

    if (categoriesCopy) {
      setTransactionCategories(categoriesCopy);
      if (onDeltaChange) {
        onDeltaChange(amount, delta, categoriesCopy);
      }
    }
  };

  const categoryItem = (category: CategoryInterface) => {
    let adjustment = 0;
    const catAmount = transactionCategories.find((c) => c.categoryId === category.id);
    if (catAmount) {
      adjustment = catAmount.amount;
    }
    const balance = balances.find((b) => b.id === category.id);

    return (
      <CategoryRebalanceItem
        key={category.id}
        category={{ name: category.name, balance: balance ? balance.balance : 0, adjustment }}
        onDeltaChange={(amount: number, delta: number) => (
          handleDeltaChange(amount, delta, category)
        )}
      />
    )
  }

  const populateCategories = (categories: CategoryInterface[]) => {
    const catItems: unknown[] = [];

    if (categories) {
      categories.forEach((category: CategoryInterface) => {
        catItems.push(categoryItem(category));
      });
    }

    return catItems;
  };

  const populateTree = () => {
    const tree: ReactElement[] = [];

    if (nodes) {
      nodes.forEach((node) => {
        if (isGroup(node)) {
          if (node.categories.length > 0) {
            tree.push((
              <div key={node.id} className="cat-rebalance-group">
                {node.name}
                {populateCategories(node.categories)}
              </div>
            ));
          }
        }
        else {
          if (!isCategory(node)) {
            throw new Error('node is not a category');
          }

          tree.push(categoryItem(node));
        }
      });
    }

    return tree;
  };

  return (
    <div className="cat-rebalance-container">
      {populateTree()}
    </div>
  );
};

export default CategoryRebalance;
