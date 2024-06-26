import React, { ReactNode, useState } from 'react';
import { DateTime } from 'luxon';
import Http from '@mortvola/http';
import { useFormikContext } from 'formik';
import FundingItem from './FundingItem';
import { isGroup } from '../State/Group';
import { isCategory } from '../State/Category';
import { CategoryInterface } from '../State/State';
import { CategoriesValueType, FundingInfoType, ValueType } from './Types';
import { FundingInfoProps, ProposedFundingCateggoryProps } from '../../common/ResponseTypes';
import { useStores } from '../State/mobxStore';

type PropsType = {
  planId: number,
  date: string,
  diffOnly: boolean,
  categories: CategoriesValueType,
}

const Funding: React.FC<PropsType> = ({
  planId,
  date,
  diffOnly,
  categories,
}) => {
  const { categoryTree } = useStores();
  const { setFieldValue } = useFormikContext<ValueType>();
  const [loadedPlanId, setLoadedPlanId] = React.useState<number>(-1);
  const [catFundingInfo, setCatFundingInfo] = useState<FundingInfoType[]>([]);

  // console.log(JSON.stringify(value))

  React.useEffect(() => {
    (async () => {
      if (planId !== -1 && planId !== loadedPlanId) {
        if (Object.keys(categories).length > 0) {
          Object.keys(categories).forEach((catId) => {
            setFieldValue(`categories.${catId}`, categories[catId])
          })

          setLoadedPlanId(planId);
        }
        else {
          const response = await Http.get<ProposedFundingCateggoryProps[]>('/api/v1/funding-plans/proposed');

          if (response.ok) {
            const body = await response.body();

            body.forEach((cat) => {
              setFieldValue(`categories.${cat.categoryId}`, cat.amount)
            })

            setLoadedPlanId(planId);
          }
        }
      }
    })();
  }, [categories, loadedPlanId, planId, setFieldValue]);

  React.useEffect(() => {
    // const newDate = date.startOf('month');

    (async () => {
      const response = await Http.get<FundingInfoProps[]>(`/api/v1/categories?date=${date}`);

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

  const renderCategory = (groupName: string | null, category: CategoryInterface) => {
    // const fundingItem = funding.find((c) => c.categoryId === category.id);
    const fundingInfo = catFundingInfo.find((c) => c.categoryId === category.id)

    return (
      <FundingItem
        key={`c:${category.id}`}
        fundingInfo={fundingInfo}
        groupName={groupName}
        category={category}
        date={DateTime.fromISO(date)}
        diffOnly={diffOnly}
      />
    );
  }

  const populateCategories = (groupName: string | null, cats: CategoryInterface[]) => (
    cats.map((category) => (
      renderCategory(groupName, category)
    ))
  );

  const populateGroups = (): ReactNode => (
    categoryTree.nodes.map((node) => {
      if (isGroup(node)) {
        if (node.id !== categoryTree.systemIds.systemGroupId) {
          return (
            // <div key={`g:${node.id}`} className={styles.fundListGroup}>
            //   {node.name}
            populateCategories(node.name, node.categories)
            // </div>
          );
        }
      }
      else {
        if (!isCategory(node)) {
          throw new Error('node is not a category');
        }

        return renderCategory(null, node);
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
