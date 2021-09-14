import { observer } from 'mobx-react-lite';
import React, { ReactElement, useContext } from 'react';
import { useFundingDialog } from '../Funding/FundingDialog';
import { useRebalanceDialog } from '../Rebalance/RebalanceDialog';
import MobxStore from '../State/mobxStore';
import { useCategoryDialog } from './CategoryDialog';
import { useGroupDialog } from './GroupDialog';
import useMediaQuery from '../MediaQuery';

type PropsType = {
  onToggleClick?: () => void,
  open?: boolean,
}

const CategoryViewToolbar = ({
  onToggleClick,
  open = false,
}: PropsType): ReactElement => {
  const { categoryTree } = useContext(MobxStore);
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();
  const [GroupDialog, showGroupDialog] = useGroupDialog();
  const { isMobile } = useMediaQuery();

  const renderCategoryButtons = () => {
    if (open || !isMobile) {
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
        </>
      )
    }

    return null;
  }

  return (
    <>
      {
        isMobile
          ? (
            <div className="navbar-light">
              <button type="button" className="navbar-toggler" onClick={onToggleClick}>
                <span className="navbar-toggler-icon" />
              </button>
            </div>
          )
          : null
      }
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
}

export default observer(CategoryViewToolbar);
