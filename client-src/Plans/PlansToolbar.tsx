import React from 'react';
import { usePlanDialog } from './PlanDialog';

const PlansToolbar: React.FC = () => {
  const [PlanDialog, openPlanDialog] = usePlanDialog();

  return (
    <>
      <button type="button" className="button" onClick={openPlanDialog}>
        Add Plan
      </button>
      <PlanDialog />
    </>
  )
}

export default PlansToolbar;
