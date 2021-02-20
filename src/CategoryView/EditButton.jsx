import React from 'react';
import PropTypes from 'prop-types';
import { useCategoryDialog } from './CategoryDialog';
import IconButton from '../IconButton';

const EditButton = ({
  category,
  group,
}) => {
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();

  if (!group.system) {
    return (
      <>
        <IconButton icon="edit" onClick={showCategoryDialog} />
        <CategoryDialog category={category} group={group} />
      </>
    );
  }

  return null;
};

EditButton.propTypes = {
  category: PropTypes.shape({
    id: PropTypes.number.isRequired,
  }).isRequired,
  group: PropTypes.shape().isRequired,
};

export default EditButton;
