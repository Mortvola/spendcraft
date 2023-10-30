import React, { ReactNode, useState } from 'react';
import { DateTime } from 'luxon';
import Http from '@mortvola/http';
import { useFormikContext } from 'formik';
import FundingItem from './FundingItem';
import { isGroup } from '../State/Group';
import { isCategory } from '../State/Category';
import { CategoryInterface } from '../State/State';
import styles from './Funding.module.scss';
import { FundingInfoType, ValueType } from './Types';
import { FundingInfoProps, ProposedFundingCateggoryProps } from '../../common/ResponseTypes';
import { useStores } from '../State/mobxStore';

type PropsType = {
  planId: number,
  date: DateTime,
}

const Funding: React.FC<PropsType> = ({
  planId,
  date,
}) => {
  const { categoryTree } = useStores();
  const { setFieldValue } = useFormikContext<ValueType>();
  const [loadedPlanId, setLoadedPlanId] = React.useState<number>(-1);
  const [catFundingInfo, setCatFundingInfo] = useState<FundingInfoType[]>([]);

  React.useEffect(() => {
    (async () => {
      if (planId !== -1 && planId !== loadedPlanId) {
        const response = await Http.get<ProposedFundingCateggoryProps[]>(`/api/v1/funding-plans/${planId}/proposed`);

        if (response.ok) {
          const body = await response.body();

          body.forEach((cat) => {
            setFieldValue(`categories.${cat.categoryId}`, cat.amount)
          })

          setLoadedPlanId(planId);
        }
      }
    })();
  }, [loadedPlanId, planId, setFieldValue]);

  React.useEffect(() => {
    const newDate = date
      .set({
        day: 1, hour: 0, minute: 0, second: 0, millisecond: 0,
      });

    (async () => {
      const response = await Http.get<FundingInfoProps[]>(`/api/v1/categories?date=${newDate.toISODate()}`);

      if (response.ok) {
        const body = await response.body();

        setCatFundingInfo(body.map((c) => ({
          categoryId: c.id,
          initialAmount: c.balance,
          previousFunding: c.previousFunding,
          previousExpenses: c.previousSum,
          previousCatTransfers: c.previousCatTransfers,
        })));
      }
    })();
  }, [date]);

  const renderCategory = (category: CategoryInterface) => {
    // const fundingItem = funding.find((c) => c.categoryId === category.id);
    const fundingInfo = catFundingInfo.find((c) => c.categoryId === category.id)

    return (
      <FundingItem
        key={`c:${category.id}`}
        fundingInfo={fundingInfo}
        category={category}
        date={date}
      />
    );
  }

  const populateCategories = (categories: CategoryInterface[]) => (
    categories.map((category) => (
      renderCategory(category)
    ))
  );

  const populateGroups = (): ReactNode => (
    categoryTree.nodes.map((node) => {
      if (isGroup(node)) {
        if (node.id !== categoryTree.systemIds.systemGroupId) {
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
