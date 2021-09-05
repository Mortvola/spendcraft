import React, { ReactElement } from 'react';
import FundingPlan from '../state/FundingPlan';
import { FundingPlanInterface } from '../state/State';
import PlanItem from './PlanItem';

type PropsType = {
  plans: FundingPlan[],
  selected?: FundingPlanInterface | null,
  onSelect?: (fundingPlan: FundingPlanInterface) => void,
}

const PlanList = ({
  plans,
  selected = null,
  onSelect,
}: PropsType): ReactElement => (
  <div className="plan-list">
    {
      plans.map((p) => (
        <PlanItem
          key={p.id}
          plan={p}
          onSelect={onSelect}
          selected={selected ? p.id === selected.id : undefined}
        />
      ))
    }
  </div>
);

export default PlanList;
