/* eslint-disable jsx-a11y/label-has-associated-control */
import 'regenerator-runtime/runtime';
import React from 'react';
import PropTypes from 'prop-types';
import { Field, ErrorMessage } from 'formik';
import { ModalDialog } from '../Modal';

const CategoryDialog = ({
  onClose,
  onExited,
  title,
  show,
  category,
  group,
}) => {
  const handleSubmit = async (values, bag) => {
    const { setErrors } = bag;
    let errors = null;

    if (category) {
      errors = await category.update(group.id, values.name);
    }
    else {
      errors = await group.addCategory({ groupId: group.id, name: values.name });
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
      errors.name = 'The category name must not be blank.';
    }

    return errors;
  };

  const handleDelete = async (bag) => {
    const { setErrors } = bag;

    const errors = await group.deleteCategory(group.id, category.id);

    if (errors && errors.length > 0) {
      // Display the first error
      // TODO: Display all the errors?
      setErrors({ name: errors[0].title });
    }
    else {
      onClose();
    }
  };

  return (
    <ModalDialog
      initialValues={{
        name: category && category.name ? category.name : '',
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
      show={show}
      onDelete={category
        ? handleDelete
        : undefined}
      onClose={onClose}
      onExited={onExited}
      title={title}
      form={() => (
        <>
          <label>
            Category:
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

CategoryDialog.propTypes = {
  category: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    update: PropTypes.func.isRequired,
  }),
  group: PropTypes.shape().isRequired,
  onClose: PropTypes.func.isRequired,
  onExited: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  show: PropTypes.bool.isRequired,
};

CategoryDialog.defaultProps = {
  category: undefined,
};

export default CategoryDialog;
