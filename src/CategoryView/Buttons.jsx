import React from 'react';
import PropTypes from 'prop-types';
import IconButton from '../IconButton';
import { useCategoryDialog } from './CategoryDialog';
import { useGroupDialog } from './GroupDialog';

function Buttons({ group }) {
  const [GroupDialog, showGroupDialog] = useGroupDialog();
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();

  if (!group.system) {
    return (
      <>
        <IconButton icon="plus" onClick={showCategoryDialog} />
        <CategoryDialog group={group} />
        <IconButton icon="edit" onClick={showGroupDialog} />
        <GroupDialog group={group} />
      </>
    );
  }

  return null;
}

Buttons.propTypes = {
  group: PropTypes.shape({
    system: PropTypes.bool.isRequired,
    id: PropTypes.number.isRequired,
  }).isRequired,
};

export default Buttons;
