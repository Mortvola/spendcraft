import React, { ReactElement, useState } from 'react';
import PropTypes from 'prop-types';
import { observer } from 'mobx-react-lite';
import AmountInput from '../AmountInput';
import Amount from '../Amount';
import FundingPlanCategory from '../State/FundingPlanCategory';

type PropsType = {
  category: FundingPlanCategory,
  onDeltaChange: ((category: FundingPlanCategory, amount: number, delta: number) => void),
}
const PlanCategory = ({
  category,
  onDeltaChange,
}: PropsType): ReactElement => {
  const [annualAmount, setAnnualAmount] = useState(12 * (category.amount || 0));

  const handleDeltaChange = (amount: number, delta: number) => {
    setAnnualAmount(amount * 12);

    if (onDeltaChange) {
      onDeltaChange(category, amount, delta);
    }
  };

  return (
    <div className="plan-detail-item">
      <div>{category.name}</div>
      <AmountInput value={category.amount} onDeltaChange={handleDeltaChange} />
      <Amount amount={annualAmount} />
    </div>
  );
};

PlanCategory.propTypes = {
  category: PropTypes.shape({
    id: PropTypes.number,
    categoryId: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    amount: PropTypes.number.isRequired,
  }).isRequired,
  onDeltaChange: PropTypes.func,
};

PlanCategory.defaultProps = {
  onDeltaChange: null,
};

export default observer(PlanCategory);
