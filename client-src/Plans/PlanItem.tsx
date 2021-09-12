import React, { ReactElement } from 'react';
import FundingPlan from '../State/FundingPlan';

type PropsType = {
  plan: FundingPlan,
  onSelect?: ((plan: FundingPlan) => void),
  selected?: boolean,
}

const PlanItem = ({
  plan,
  onSelect,
  selected = false,
}: PropsType): ReactElement => {
  const handleClick = () => {
    if (onSelect) {
      onSelect(plan);
    }
  };

  let className;
  if (selected) {
    className = ' selected';
  }

  return (
    <div className={className} onClick={handleClick}>{plan.name}</div>
  );
};

export default PlanItem;
