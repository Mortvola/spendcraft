import React, { ReactElement } from 'react';
import PropTypes, { string } from 'prop-types';
import IconButton from '../IconButton';
import { useCategoryDialog } from './CategoryDialog';
import { useLoanDialog } from './LoanDialog';
import { useGroupDialog } from './GroupDialog';
import GroupState, { isGroup } from '../state/Group';
import LoansGroup, { isLoansGroup } from '../state/LoansGroup';

type Props = {
  group: GroupState | LoansGroup,
}

function Buttons({ group }: Props): ReactElement | null {
  const [GroupDialog, showGroupDialog] = useGroupDialog();
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();
  const [LoanDialog, showLoanDialog] = useLoanDialog();

  const renderEditButton = () => {
    if (!group.system && isGroup(group)) {
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
    if (!group.system && isGroup(group)) {
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

Buttons.propTypes = {
  group: PropTypes.shape({
    system: PropTypes.bool.isRequired,
    id: PropTypes.number.isRequired,
    name: string,
  }).isRequired,
};

export default Buttons;
