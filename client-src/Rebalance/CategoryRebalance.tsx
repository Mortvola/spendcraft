import React, { ReactElement, useState } from 'react';
import CategoryRebalanceItem from './CategoryRebalanceItem';
import {
  CategoryBalanceInterface, CategoryInterface, GroupInterface, TransactionCategoryInterface,
} from '../State/Types';
import { isGroup } from '../State/Group';
import { isCategory } from '../State/Category';
import { useStores } from '../State/Store';
import { CategoryType } from '../../common/ResponseTypes';

type PropsType = {
  onDeltaChange: null | ((amunt: number, delta: number, categories: unknown) => void),
  balances: CategoryBalanceInterface[],
  trxCategories: TransactionCategoryInterface[],
}

const CategoryRebalance: React.FC<PropsType> = ({
  balances,
  trxCategories,
  onDeltaChange,
}) => {
  const { categoryTree } = useStores();
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

  const populateCategories = (categories: (GroupInterface | CategoryInterface)[]) => (
    categories
      .filter((category) => isCategory(category))
      .filter((category) => (
        category.type !== CategoryType.Unassigned
        && category.type !== CategoryType.AccountTransfer
      ))
      .map((category) => (
        categoryItem(category)
      ))
  );

  const populateTree = () => {
    const tree: ReactElement[] = [];

    if (categoryTree.budget.children) {
      categoryTree.budget.children
        .filter((n) => (
          isGroup(n)
          || (
            n.type !== CategoryType.Unassigned
            && n.type !== CategoryType.AccountTransfer
          )
        ))
        .forEach((node) => {
          if (isGroup(node)) {
            if (node.children.length > 0) {
              tree.push((
                <div key={node.id} className="cat-rebalance-group">
                  {node.name}
                  {populateCategories(node.children)}
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
