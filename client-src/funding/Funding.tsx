import React, { ReactElement, ReactNode, useState } from 'react';
import FundingItem from './FundingItem';
import { isGroup } from '../state/Group';
import { isCategory } from '../state/Category';
import { TreeNodeInterface, CategoryInterface } from '../state/State';

export type FundingType = {
  id?: number,
  initialAmount: number,
  amount: number,
  categoryId: number,
}

type PropsType = {
  groups: TreeNodeInterface[],
  plan: FundingType[],
  onChange: ((p: FundingType[]) => void),
  systemGroupId: number,
}

const Funding = ({
  groups,
  plan,
  onChange,
  systemGroupId,
}: PropsType): ReactElement => {
  const [funding, setFunding] = useState<FundingType[]>(plan);

  const handleDeltaChange = (amount: number, categoryId: number) => {
    const index = funding.findIndex((c) => c.categoryId === categoryId);
    let newFunding: FundingType[] = [];

    if (index !== -1) {
      newFunding = [
        ...funding.slice(0, index),
        { ...funding[index], categoryId, amount },
        ...funding.slice(index + 1),
      ];
    }
    else {
      // Find the category in the group/category tree
      let category: CategoryInterface | undefined;
      const group = groups.find((g) => {
        if (isGroup(g)) {
          category = g.categories.find((c) => c.id === categoryId);
        }
        else {
          if (!isCategory(g)) {
            throw new Error('group is not a category');
          }

          category = g;
        }

        return category !== undefined;
      });

      if (!category) {
        throw new Error('category is undefined');
      }

      if (!group) {
        throw new Error('group is undefined');
      }

      newFunding = [
        ...funding.slice(),
        {
          categoryId,
          initialAmount: category.balance,
          amount,
        },
      ];
    }

    setFunding(newFunding);

    if (onChange) {
      onChange(newFunding);
    }
  };

  const renderCategory = (category: CategoryInterface) => {
    let amount = 0;

    const fundingItem = funding.find((c) => c.categoryId === category.id);

    let initialAmount = category.balance;
    if (fundingItem) {
      initialAmount = fundingItem.initialAmount;
      amount = fundingItem.amount;
    }

    return (
      <FundingItem
        key={`${category.id}`}
        name={category.name}
        initialAmount={initialAmount}
        funding={amount}
        onDeltaChange={(newAmount) => (
          handleDeltaChange(newAmount, category.id)
        )}
      />
    );
  }

  const populateCategories = (categories: CategoryInterface[]) => (
    categories.map((category) => (
      renderCategory(category)
    ))
  );

  const populateGroups = (): ReactNode => (
    groups.map((node) => {
      if (isGroup(node)) {
        if (node.id !== systemGroupId) {
          return (
            <div key={node.id} className="fund-list-group">
              {node.name}
              {populateCategories(node.categories)}
            </div>
          );
        }
      }
      else {
        if (!isCategory(node)) {
          throw new Error('node is not a category');
        }

        return renderCategory(node);
      }

      return null;
    }).filter((e) => e !== null)
  );

  return (
    <div className="cat-fund-items">
      {populateGroups()}
    </div>
  );
};

export default Funding;
