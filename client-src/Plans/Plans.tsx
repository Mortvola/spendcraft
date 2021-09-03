import React, { useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import PlanItem from './PlanItem';
import PlanDetails from './PlanDetails';
import MobxStore from '../state/mobxStore';
import FundingPlan from '../state/FundingPlan';

const Plans = () => {
  const { plans, uiState } = useContext(MobxStore);

  useEffect(() => {
    plans.load();
  }, [plans]);

  useEffect(() => {
    if (uiState.selectedPlanId !== null) {
      plans.loadDetails(uiState.selectedPlanId);
    }
  }, [plans, uiState.selectedPlanId]);

  const handleSelect = (p: FundingPlan) => {
    uiState.selectPlanId(p.id);
  };

  const renderPlanList = () => (
    plans.list.map((p) => (
      <PlanItem
        key={p.id}
        plan={p}
        onSelect={handleSelect}
        selected={p.id === uiState.selectedPlanId}
      />
    ))
  );

  return (
    <div className="plans-page main-tray">
      <div className="side-bar window">
        {renderPlanList()}
      </div>
      <PlanDetails />
    </div>
  );
};

export default observer(Plans);
