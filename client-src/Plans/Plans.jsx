import React, { useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import PlanItem from './PlanItem';
import PlanDetails from './PlanDetails';
import MobxStore from '../state/mobxStore';
import { usePlanDialog } from './PlanDialog';

const Plans = () => {
  const { plans, uiState } = useContext(MobxStore);
  const [PlanDialog, openPlanDialog] = usePlanDialog();

  useEffect(() => {
    plans.load();
  }, [plans]);

  useEffect(() => {
    plans.loadDetails(uiState.selectedPlanId);
  }, [plans, uiState.selectedPlanId]);

  const handleSelect = (p) => {
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

  const renderPlanDetails = () => {
    if (uiState.selectedPlanId !== null) {
      return <PlanDetails />;
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
