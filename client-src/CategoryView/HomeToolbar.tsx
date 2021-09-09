import React, { ReactElement } from 'react';
import { useFundingDialog } from '../funding/FundingDialog';
import { useRebalanceDialog } from '../rebalance/RebalanceDialog';
import { useCategoryDialog } from './CategoryDialog';

const HomeToolbar = (): ReactElement => {
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();

  return (
    <>
      <button type="button" onClick={showCategoryDialog}>Add Category</button>
      <CategoryDialog />
      <button type="button" onClick={showRebalanceDialog}>Rebalance</button>
      <RebalanceDialog />
      <button type="button" onClick={showFundingDialog}>Fund</button>
      <FundingDialog />
    </>
  )
}

export default HomeToolbar;
