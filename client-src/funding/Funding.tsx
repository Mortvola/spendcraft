import React, { ReactElement, ReactNode, useState } from 'react';
import FundingItem from './FundingItem';
import { CategoryProps, CategoryType, GroupProps } from '../../common/ResponseTypes';

export type FundingType = {
  id?: number,
  type: CategoryType,
  initialAmount: number,
  amount: number,
  categoryId: number,
}

type PropsType = {
  groups: GroupProps[],
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
  const [funding, setFunding] = useState(plan);

  const handleDeltaChange = (amount: number, categoryId: number) => {
    const index = funding.findIndex((c) => c.categoryId === categoryId);
    let newFunding = [];

    if (index !== -1) {
      newFunding = [
        ...funding.slice(0, index),
        { ...funding[index], categoryId, amount },
        ...funding.slice(index + 1),
      ];
    }
    else {
      // Find the category in the group/category tree
      let category: CategoryProps | undefined;
      const group = groups.find((g) => {
        category = g.categories.find((c) => c.id === categoryId);

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
          type: category.type,
        },
      ];
    }

    setFunding(newFunding);

    if (onChange) {
      onChange(newFunding);
    }
  };

  const populateCategories = (categories: CategoryProps[]) => (
    categories.map((category) => {
      let amount = 0;

      const index = funding.findIndex((c) => c.categoryId === category.id);

      let initialAmount = category.balance;
      if (index !== -1) {
        initialAmount = funding[index].initialAmount;
        amount = funding[index].amount;
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
    })
  );

  const populateGroups = (): ReactNode => (
    groups.map((group) => {
      if (group.id !== systemGroupId) {
        return (
          <div key={group.id}>
            {group.name}
            {populateCategories(group.categories)}
          </div>
        );
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
