import React from 'react';
import PropTypes from 'prop-types';
import { ModalLauncher } from '../Modal';
import CategoryDialog from './CategoryDialog';
import IconButton from '../IconButton';

const EditButton = ({
  category,
  group,
}) => {
  if (!group.system) {
    return (
      <ModalLauncher
        launcher={(props) => (<IconButton icon="edit" {...props} />)}
        title="Edit Category"
        dialog={(props) => (
          <CategoryDialog category={category} group={group} {...props} />
        )}
      />
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
