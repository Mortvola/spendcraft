import React, { ReactElement, useState } from 'react';
import CategoryRebalanceItem from './CategoryRebalanceItem';
import {
  type CategoryBalanceInterface, CategoryInterface, GroupInterface, TransactionCategoryInterface,
} from '../State/Types';
import { isGroup } from '../State/Group';
import { useStores } from '../State/Store';
import { CategoryType } from '../../common/ResponseTypes';
import styles from './CategoryRebalanceItem.module.scss';

interface PropsType {
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

  const categoryItem = (category: CategoryInterface, level: number): React.JSX.Element => {
    let adjustment = 0;
    const catAmount = transactionCategories.find((c) => c.categoryId === category.id);
    if (catAmount) {
      adjustment = catAmount.amount;
    }
    const balance = balances.find((b) => b.id === category.id);

    return (
      <>
        <CategoryRebalanceItem
          key={category.id}
          style={{ paddingLeft: level * 28, textDecoration: category.suspended ? 'line-through' : undefined }}
          category={{ name: category.name, balance: balance ? balance.balance : 0, adjustment }}
          onDeltaChange={(amount: number, delta: number) => (
            handleDeltaChange(amount, delta, category)
          )}
        />
        {
          category.subcategories.map((subcat) => (
            categoryItem(subcat, level + 1)
          ))
        }
      </>
    )
  }

  const populateCategories = (categories: (GroupInterface | CategoryInterface)[], level: number): ReactElement[] => (
    categories
      .filter((node) => (
        isGroup(node)
        || (node.type !== CategoryType.Unassigned
        && node.type !== CategoryType.AccountTransfer)
      ))
      .map((node) => {
        if (isGroup(node)) {
          if (node.children.length > 0) {
            return (
              <>
                <div key={node.id} className={styles.catRebalanceGroup} style={{ paddingLeft: level * 28 }}>
                  {node.name}
                </div>
                {populateCategories(node.children, level + 1)}
              </>
            )
          }
        }
        else {
          return (
            categoryItem(node as CategoryInterface, level)
          )
        }

        return null
      })
      .filter((node) => node !== null)
  );

  const populateTree = (root: GroupInterface) => {
    if (root.children) {
      return (
        <>
          {
            // categoryTree.budget.fundingPoolCat?.subcategories.map((subcat) => (
            //   categoryItem(subcat, 0)
            // ))
          }
          {
            populateCategories(root.children, 1)
          }
        </>
      )
    }

    return [];
  };

  return (
    <div className={styles.catRebalanceContainer}>
      <div>Categories</div>
      {populateTree(categoryTree.budget)}
      <div>Bills</div>
      {populateTree(categoryTree.bills)}
    </div>
  );
};

export default CategoryRebalance;
