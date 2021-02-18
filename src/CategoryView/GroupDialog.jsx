/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useContext } from 'react';
import PropTypes from 'prop-types';
import { Field, ErrorMessage } from 'formik';
import { ModalDialog } from '../Modal';
import MobxStore from '../state/mobxStore';

const GroupDialog = ({
  onClose,
  onExited,
  title,
  show,
  group,
}) => {
  const { categoryTree } = useContext(MobxStore);

  const handleSubmit = async (values, bag) => {
    const { setErrors } = bag;
    let errors = null;

    if (group) {
      errors = await group.update(values.name);
    }
    else {
      errors = await categoryTree.addGroup(values.name);
    }

    if (errors && errors.length > 0) {
      // Display the first error
      // TODO: Display all the errors?
      setErrors({ name: errors[0].title });
    }
    else {
      onClose();
    }
  };

  const handleValidate = (values) => {
    const errors = {};

    if (values.name === '') {
      errors.name = 'The group name must not be blank.';
    }

    return errors;
  };

  const handleDelete = async (bag) => {
    const { setTouched, setErrors } = bag;

    const errors = await categoryTree.deleteGroup(group.id);

    if (errors && errors.length > 0) {
      // Display the first error
      // TODO: Display all the errors?
      setTouched({ name: true }, false);
      setErrors({ name: errors[0].title });
    }
    else {
      onClose();
    }
  };

  return (
    <ModalDialog
      initialValues={{
        name: group && group.name ? group.name : '',
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
      show={show}
      onDelete={group
        ? handleDelete
        : undefined}
      onClose={onClose}
      onExited={onExited}
      title={title}
      form={() => (
        <>
          <label>
            Group:
            <Field
              type="text"
              className="form-control"
              name="name"
            />
          </label>
          <br />
          <ErrorMessage name="name" />
        </>
      )}
    />
  );
};

GroupDialog.propTypes = {
  group: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    update: PropTypes.func.isRequired,
  }),
  onClose: PropTypes.func.isRequired,
  onExited: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  show: PropTypes.bool.isRequired,
};

GroupDialog.defaultProps = {
  group: undefined,
};

export default GroupDialog;
