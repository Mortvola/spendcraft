import React, { ReactElement, useContext } from 'react';
import { usePlanDialog } from './PlanDialog';

const PlansToolbar = (): ReactElement => {
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
