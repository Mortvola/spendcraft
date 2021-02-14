/* eslint-disable jsx-a11y/label-has-associated-control */
import React from 'react';
import PropTypes from 'prop-types';
import { Field, ErrorMessage } from 'formik';
import { connect } from 'react-redux';
import { addGroup, updateGroup, deleteGroup } from '../redux/actions';
import { ModalDialog } from '../Modal';

const GroupDialog = (props) => {
  const {
    onClose,
    onExited,
    title,
    show,
    group,
    dispatch,
  } = props;

  const handleSubmit = (values, bag) => {
    const { setErrors } = bag;
    if (group) {
      fetch(`/groups/${group.id}`, {
        method: 'PATCH',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: values.name }),
      })
        .then((response) => response.json())
        .then((response) => {
          if (response.errors && response.errors.length > 0) {
            // Display the first error
            // TODO: Display all the errors?
            setErrors({ name: response.errors[0].title });
          }
          else {
            dispatch(updateGroup({ id: group.id, name: response.name }));
            onClose();
          }
        });
    }
    else {
      fetch('/groups', {
        method: 'POST',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: values.name }),
      })
        .then((response) => response.json())
        .then((response) => {
          if (response.errors && response.errors.length > 0) {
            // Display the first error
            // TODO: Display all the errors?
            setErrors({ name: response.errors[0].title });
          }
          else {
            dispatch(addGroup({ id: response.id, name: response.name }));
            onClose();
          }
        });
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

    const response = await fetch(`/groups/${group.id}`, {
      method: 'DELETE',
      headers: {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
      },
    });

    let body = null;
    if (/^application\/json/.test(response.headers.get('content-type'))) {
      body = await response.json();
    }

    if (!response.ok) {
      if (body && body.errors) {
        // Display the first error
        // TODO: Display all the errors?
        setTouched({ name: true }, false);
        setErrors({ name: body.errors[0].title });
      }
    }
    else {
      dispatch(deleteGroup({ id: group.id }));
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
  }),
  onClose: PropTypes.func.isRequired,
  onExited: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  show: PropTypes.bool.isRequired,
  dispatch: PropTypes.func.isRequired,
};

GroupDialog.defaultProps = {
  group: undefined,
};

export default connect()(GroupDialog);
