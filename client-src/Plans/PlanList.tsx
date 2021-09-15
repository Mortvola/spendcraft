import React, { ReactElement, useContext } from 'react';
import FundingPlan from '../State/FundingPlan';
import MobxStore from '../State/mobxStore';
import { FundingPlanInterface } from '../State/State';
import PlanItem from './PlanItem';

type PropsType = {
  plans: FundingPlan[],
  selected?: FundingPlanInterface | null,
  onSelect?: () => void,
}

const PlanList = ({
  plans,
  selected = null,
  onSelect,
}: PropsType): ReactElement => {
  const { uiState } = useContext(MobxStore);

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
