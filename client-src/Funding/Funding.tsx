import React, { ReactNode, useState } from 'react';
import { DateTime } from 'luxon';
import FundingItem from './FundingItem';
import { isGroup } from '../State/Group';
import { isCategory } from '../State/Category';
import { TreeNodeInterface, CategoryInterface } from '../State/State';
import styles from './Funding.module.css';
import { FundingInfoType, FundingType } from './Types';

type PropsType = {
  groups: TreeNodeInterface[],
  plan: FundingType[],
  catFundingInfo: FundingInfoType[],
  date: DateTime,
  onChange: ((p: FundingType[]) => void),
  systemGroupId: number,
}

const Funding: React.FC<PropsType> = ({
  groups,
  plan,
  catFundingInfo,
  date,
  onChange,
  systemGroupId,
}) => {
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
    const fundingItem = funding.find((c) => c.categoryId === category.id);
    const fundingInfo = catFundingInfo.find((c) => c.categoryId === category.id)

    return (
      <FundingItem
        key={`c:${category.id}`}
        fundingInfo={fundingInfo}
        name={category.name}
        funding={fundingItem?.amount ?? 0}
        date={date}
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
            <div key={`g:${node.id}`} className={styles.fundListGroup}>
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
