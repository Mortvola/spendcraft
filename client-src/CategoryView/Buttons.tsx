import React, { ReactElement } from 'react';
import PropTypes, { string } from 'prop-types';
import IconButton from '../IconButton';
import { useCategoryDialog } from './CategoryDialog';
import { useLoanDialog } from './LoanDialog';
import { useGroupDialog } from './GroupDialog';
import GroupState from '../state/Group';

type Props = {
  group: GroupState,
}

function Buttons({ group }: Props): ReactElement | null {
  const [GroupDialog, showGroupDialog] = useGroupDialog();
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();
  const [LoanDialog, showLoanDialog] = useLoanDialog();

  const renderEditButton = () => {
    if (!group.system) {
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
    if (!group.system) {
      return (
        <>
          <IconButton icon="plus" onClick={showCategoryDialog} />
          <CategoryDialog group={group} />
        </>
      );
    }

    if (group.name === 'Loans') {
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

  return null;
}

Buttons.propTypes = {
  group: PropTypes.shape({
    system: PropTypes.bool.isRequired,
    id: PropTypes.number.isRequired,
    name: string,
  }).isRequired,
};

export default Buttons;
