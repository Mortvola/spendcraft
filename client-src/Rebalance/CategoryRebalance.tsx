import React, { ReactElement, useState } from 'react';
import CategoryRebalanceItem from './CategoryRebalanceItem';
import {
  CategoryBalanceInterface, CategoryInterface, GroupInterface, TransactionCategoryInterface,
} from '../State/Types';
import { isGroup } from '../State/Group';
import { useStores } from '../State/Store';
import { CategoryType } from '../../common/ResponseTypes';

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

  const categoryItem = (category: CategoryInterface, padding: number): React.JSX.Element => {
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
          style={{ paddingLeft: padding }}
          category={{ name: category.name, balance: balance ? balance.balance : 0, adjustment }}
          onDeltaChange={(amount: number, delta: number) => (
            handleDeltaChange(amount, delta, category)
          )}
        />
        {
          category.subcategories.map((subcat) => (
            categoryItem(subcat, padding + 28)
          ))
        }
      </>
    )
  }

  const populateCategories = (categories: (GroupInterface | CategoryInterface)[], padding: number): ReactElement[] => (
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
                <div key={node.id} className="cat-rebalance-group" style={{ paddingLeft: padding }}>
                  {node.name}
                </div>
                {populateCategories(node.children, padding + 28)}
              </>
            )
          }
        }
        else {
          return (
            categoryItem(node as CategoryInterface, padding)
          )
        }

        return null
      })
      .filter((node) => node !== null)
  );

  const populateTree = () => {
    if (categoryTree.budget.children) {
      return (
        <>
          {
            categoryTree.budget.fundingPoolCat?.subcategories.map((subcat) => (
              categoryItem(subcat, 0)
            ))
          }
          {
            populateCategories(categoryTree.budget.children, 0)
          }
        </>
      )
    }

    return [];
  };

  return (
    <div className="cat-rebalance-container">
      {populateTree()}
    </div>
  );
};

export default CategoryRebalance;
