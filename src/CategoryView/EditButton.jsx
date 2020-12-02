import React from 'react';
import PropTypes from 'prop-types';
import { ModalLauncher } from '../Modal';
import CategoryDialog from './CategoryDialog';
import IconButton from '../IconButton';

function EditButton({ category, groupId, systemGroup }) {
  if (!systemGroup) {
    return (
      <ModalLauncher
        launcher={(props) => (<IconButton icon="edit" {...props} />)}
        title="Edit Category"
        dialog={(props) => (
          <CategoryDialog category={category} groupId={groupId} {...props} />
        )}
      />
    );
  }

  return null;
}

EditButton.propTypes = {
  category: PropTypes.shape({
    id: PropTypes.number.isRequired,
  }).isRequired,
  groupId: PropTypes.number.isRequired,
  systemGroup: PropTypes.bool.isRequired,
};

export default EditButton;
