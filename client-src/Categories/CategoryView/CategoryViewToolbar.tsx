import { observer } from 'mobx-react-lite';
import React from 'react';
import { Dropdown } from 'react-bootstrap';
import { useFundingDialog } from '../../Funding/FundingDialog';
import { useRebalanceDialog } from '../../Rebalance/RebalanceDialog';
import { useStores } from '../../State/mobxStore';
import { useCategoryDialog } from './CategoryDialog';
import { useGroupDialog } from './GroupDialog';
import useMediaQuery from '../../MediaQuery';
import { useBillDialog } from './BillDialog';

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
  const [BillDialog, showBillDialog] = useCategoryDialog();
  const [GoalDialog, showGoalDialog] = useCategoryDialog();
  const [GroupDialog, showGroupDialog] = useGroupDialog();
  const { isMobile } = useMediaQuery();

  const handleAddClick = (eventKey: unknown) => {
    switch (eventKey) {
      case 'GROUP':
        showGroupDialog();
        break;
      case 'CATEGORY':
        showCategoryDialog();
        break;
      case 'BILL':
        showBillDialog();
        break;
      case 'GOAL':
        showGoalDialog();
        break;

      default:
        break;
    }
  }

  const renderCategoryButtons = () => (
    open || !isMobile
      ? (
        <>
          <Dropdown
            onSelect={handleAddClick}
          >
            <Dropdown.Toggle id="dropdown-basic">
              Add...
            </Dropdown.Toggle>

            <Dropdown.Menu>
              <Dropdown.Item eventKey="GROUP">Group</Dropdown.Item>
              <Dropdown.Item eventKey="CATEGORY">Category</Dropdown.Item>
              <Dropdown.Item eventKey="BILL">Bill</Dropdown.Item>
              <Dropdown.Item eventKey="GOAL">Goal</Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
          {
            categoryTree.noGroupGroup !== null
              ? (
                <>
                  {/* <button type="button" onClick={showCategoryDialog}>Add Category</button> */}
                  <CategoryDialog />
                </>
              )
              : null
          }
          {/* <button type="button" onClick={showGroupDialog}>Add Group</button> */}
          <GroupDialog />
          <BillDialog type="BILL" />
          <GoalDialog type="GOAL" />
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
