import React from 'react';
import FundingPlan from '../State/FundingPlan';
import { useStores } from '../State/Store';
import { FundingPlanInterface } from '../State/Types';
import PlanItem from './PlanItem';

type PropsType = {
  plans: FundingPlan[],
  selected?: FundingPlanInterface | null,
  onSelect?: () => void,
}

const PlanList: React.FC<PropsType> = ({
  plans,
  selected = null,
  onSelect,
}) => {
  const { uiState } = useStores();

  const handleSelect = (p: FundingPlanInterface) => {
    uiState.selectPlan(p);
    if (onSelect) {
      onSelect();
    }
  };

  return (
    <div className="plan-list">
      {
        plans.map((p) => (
          <PlanItem
            key={p.id}
            plan={p}
            onSelect={handleSelect}
            selected={selected ? p.id === selected.id : undefined}
          />
        ))
      }
    </div>
  );
}

export default PlanList;
