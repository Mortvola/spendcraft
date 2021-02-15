import React from 'react';
import PropTypes from 'prop-types';
import { ModalLauncher } from '../Modal';
import IconButton from '../IconButton';
import CategoryDialog from './CategoryDialog';
import GroupDialog from './GroupDialog';

function Buttons({ group }) {
  if (!group.system) {
    return (
      <>
        <ModalLauncher
          launcher={(props) => (<IconButton icon="plus" {...props} />)}
          title="Add Category"
          dialog={(props) => (<CategoryDialog group={group} {...props} />)}
        />
        <ModalLauncher
          launcher={(props) => (<IconButton icon="edit" {...props} />)}
          title="Edit Group"
          dialog={(props) => (<GroupDialog group={group} {...props} />)}
        />
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
