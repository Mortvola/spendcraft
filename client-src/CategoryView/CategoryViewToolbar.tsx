import { observer } from 'mobx-react-lite';
import React, { ReactElement, useContext } from 'react';
import { useFundingDialog } from '../funding/FundingDialog';
import { useRebalanceDialog } from '../rebalance/RebalanceDialog';
import MobxStore from '../state/mobxStore';
import { useCategoryDialog } from './CategoryDialog';
import { useGroupDialog } from './GroupDialog';

const CategoryViewToolbar = (): ReactElement => {
  const { categoryTree } = useContext(MobxStore);
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();
  const [GroupDialog, showGroupDialog] = useGroupDialog();

  return (
    <>
      {
        categoryTree.noGroupGroup !== null
          ? (
            <>
              <button type="button" onClick={showCategoryDialog}>Add Category</button>
              <CategoryDialog group={categoryTree.noGroupGroup} />
            </>
          )
          : null
      }
      <button type="button" onClick={showGroupDialog}>Add Group</button>
      <GroupDialog />
      <button type="button" onClick={showRebalanceDialog}>Rebalance</button>
      <RebalanceDialog />
      <button type="button" onClick={showFundingDialog}>Fund</button>
      <FundingDialog />
    </>
  )
}

export default observer(CategoryViewToolbar);
