import { observer } from 'mobx-react-lite';
import React from 'react';
import { useFundingDialog } from '../Funding/FundingDialog';
import { useRebalanceDialog } from '../Rebalance/RebalanceDialog';
import { useStores } from '../State/mobxStore';
import { useCategoryDialog } from './CategoryDialog';
import { useGroupDialog } from './GroupDialog';
import useMediaQuery from '../MediaQuery';

type PropsType = {
  open?: boolean,
}

const CategoryViewToolbar: React.FC<PropsType> = observer(({
  open = false,
}) => {
  const { categoryTree } = useStores();
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();
  const [GroupDialog, showGroupDialog] = useGroupDialog();
  const { isMobile } = useMediaQuery();

  const renderCategoryButtons = () => (
    open || !isMobile
      ? (
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
        </>
      )
      : null
  )

  return (
    <>
      {renderCategoryButtons()}
      {
        !open || !isMobile
          ? (
            <>
              <button type="button" onClick={showRebalanceDialog}>Rebalance</button>
              <RebalanceDialog />
              <button type="button" onClick={showFundingDialog}>Fund</button>
              <FundingDialog />
            </>
          )
          : null
      }
    </>
  )
});

export default CategoryViewToolbar;
