import React, { ReactElement } from 'react';
import CategoryRebalanceItem from './CategoryRebalanceItem';
import {
  type CategoryBalanceInterface, CategoryInterface, GroupInterface,
} from '../State/Types';
import { isGroup } from '../State/Group';
import { useStores } from '../State/Store';
import { CategoryType } from '../../common/ResponseTypes';
import styles from './CategoryRebalanceItem.module.scss';
import type { CategorySplitInput } from '../CategorySplits';
import { parseMoneyCents } from '../../common/moneyCents';
import { inputMoneyCents } from '../monetary';

interface PropsType {
  onChange: (categories: CategorySplitInput[]) => void,
  balances: CategoryBalanceInterface[],
  trxCategories: CategorySplitInput[],
}

const CategoryRebalance: React.FC<PropsType> = ({
  balances,
  trxCategories,
  onChange,
}) => {
  const { categoryTree } = useStores();
  const transactionCategories = trxCategories;

  const handleAmountChange = (amount: string, category: CategoryInterface) => {
    let isZero = false;
    try { isZero = inputMoneyCents(amount) === 0; }
    catch { /* Preserve incomplete edits so validation can report them. */ }
    let categoriesCopy = null;
    const index = transactionCategories.findIndex((c) => c.categoryId === category.id);

    if (index === -1) {
      if (!isZero) {
        categoriesCopy = [
          ...transactionCategories,
          {
            categoryId: category.id,
            amount,
          },
        ];
      }
    }
    else if (isZero) {
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
      onChange(categoriesCopy);
    }
  };

  const categoryItem = (category: CategoryInterface, level: number): React.JSX.Element => {
    let adjustment = '0.00';
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
          category={{ name: category.name, balanceCents: balance?.balanceCents ?? parseMoneyCents('0.00'), adjustment }}
          onChange={(amount) => handleAmountChange(amount, category)}
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
