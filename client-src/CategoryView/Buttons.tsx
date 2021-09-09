import React, { ReactElement } from 'react';
import IconButton from '../IconButton';
import { useCategoryDialog } from './CategoryDialog';
import { useLoanDialog } from './LoanDialog';
import { useGroupDialog } from './GroupDialog';
import { isGroup } from '../state/Group';
import { isLoansGroup } from '../state/LoansGroup';
import { GroupInterface } from '../state/State';

type Props = {
  group: GroupInterface,
}

function Buttons({ group }: Props): ReactElement | null {
  const [GroupDialog, showGroupDialog] = useGroupDialog();
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();
  const [LoanDialog, showLoanDialog] = useLoanDialog();

  const renderEditButton = () => {
    if (group.type === 'REGULAR' && isGroup(group)) {
      return (
        <>
          <IconButton icon="edit" onClick={showGroupDialog} />
          <GroupDialog group={group} />
        </>
      );
    }

    return null;
  };

  const renderAddCategoryButton = () => {
    if (group.type === 'REGULAR' && isGroup(group)) {
      return (
        <>
          <IconButton icon="plus" onClick={showCategoryDialog} />
          <CategoryDialog group={group} />
        </>
      );
    }

    if (isLoansGroup(group)) {
      return (
        <>
          <IconButton icon="plus" onClick={showLoanDialog} />
          <LoanDialog group={group} />
        </>
      );
    }

    return null;
  };

  return (
    <>
      {renderAddCategoryButton()}
      {renderEditButton()}
    </>
  );
}

export default Buttons;
