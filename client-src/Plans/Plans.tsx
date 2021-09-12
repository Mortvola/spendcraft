import React, { useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import PlanDetails from './PlanDetails';
import MobxStore from '../State/mobxStore';
import PlanList from './PlanList';
import { FundingPlanInterface } from '../State/State';

const Plans = () => {
  const { plans, uiState } = useContext(MobxStore);

  useEffect(() => {
    plans.load();
  }, [plans]);

  useEffect(() => {
    if (uiState.selectedPlan !== null) {
      plans.loadDetails(uiState.selectedPlan);
    }
  }, [plans, uiState.selectedPlan]);

  const handleSelect = (p: FundingPlanInterface) => {
    uiState.selectPlan(p);
  };

  return (
    <>
      <div className="side-bar window">
        <PlanList plans={plans.list} selected={uiState.selectedPlan} onSelect={handleSelect} />
      </div>
      <PlanDetails />
    </>
  );
};

export default observer(Plans);
