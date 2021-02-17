import React, { useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import PlanItem from './PlanItem';
import PlanDetails from './PlanDetails';
import MobxStore from '../redux/mobxStore';
import { usePlanDialog } from './PlanDialog';

const Plans = () => {
  const { plans, uiState } = useContext(MobxStore);
  const [PlanDialog, openPlanDialog] = usePlanDialog();

  useEffect(() => {
    plans.load();
  }, [plans]);

  const handleSelect = (p) => {
    uiState.selectPlan(p);
  };

  const renderPlanList = () => (
    plans.list.map((p) => (
      <PlanItem key={p.id} plan={p} onSelect={handleSelect} selected={p === uiState.selectedPlan} />
    ))
  );

  const renderPlanDetails = () => {
    if (uiState.selectedPlan) {
      return <div />;
      //<PlanDetails plan={uiState.selectedPlan} />;
    }

    return <div />;
  };

  return (
    <>
      <div className="side-bar">
        <div className="plan-tools">
          <button type="button" id="add-group" className="button" onClick={openPlanDialog}>
            Add Plan
          </button>
          <PlanDialog />
        </div>
        {renderPlanList()}
      </div>
      {renderPlanDetails()}
    </>
  );
};

export default observer(Plans);
