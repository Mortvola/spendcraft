import React, { ReactElement } from 'react';
import { useGroupDialog } from './CategoryView/GroupDialog';
import { useFundingDialog } from './funding/FundingDialog';
import { useRebalanceDialog } from './rebalance/RebalanceDialog';

const HomeToolbar = (): ReactElement => {
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [GroupDialog, showGroupDialog] = useGroupDialog();

  return (
    <>
      <button type="button" onClick={showGroupDialog}>Add Group</button>
      <GroupDialog />
      <button type="button" onClick={showRebalanceDialog}>Rebalance</button>
      <RebalanceDialog />
      <button type="button" onClick={showFundingDialog}>Fund</button>
      <FundingDialog />
    </>
  )
}

export default HomeToolbar;
