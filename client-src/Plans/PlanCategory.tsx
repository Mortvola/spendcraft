import React from 'react';
import { observer } from 'mobx-react-lite';
import AmountInput from '../AmountInput';
import Amount from '../Amount';
import { CategoryInterface } from '../State/State';
import IconButton from '../IconButton';
import styles from './PlanCategory.module.scss';
import FundingPlanCategory from '../State/FundingPlanCategory';

type PropsType = {
  category: CategoryInterface,
  planCategory: FundingPlanCategory,
  onDeltaChange: ((planCategory: FundingPlanCategory, amount: number) => void),
  onEditCategory: (category: CategoryInterface, planCategory: FundingPlanCategory) => void,
}

const PlanCategory: React.FC<PropsType> = observer(({
  category,
  planCategory,
  onDeltaChange,
  onEditCategory,
}) => {
  const handleDeltaChange = (newAmount: number) => {
    if (onDeltaChange) {
      onDeltaChange(planCategory, newAmount);
    }
  };

  const handleEditCategory = () => {
    onEditCategory(category, planCategory);
  }

  return (
    <div className={styles.planDetailItem}>
      <div>{category.name}</div>
      <div className={styles.monthlyAmount}>
        {
          planCategory.useGoal
            ? <Amount amount={planCategory.monthlyAmount(category)} />
            : <AmountInput value={planCategory.amount} onDeltaChange={handleDeltaChange} />
        }
        <IconButton icon="pencil-alt" onClick={handleEditCategory} />
      </div>
      <Amount amount={planCategory.amount * 12} />
    </div>
  );
});

export default PlanCategory;
