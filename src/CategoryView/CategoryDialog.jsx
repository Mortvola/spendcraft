/* eslint-disable jsx-a11y/label-has-associated-control */
import React from 'react';
import PropTypes from 'prop-types';
import {
  Formik, Form, Field, ErrorMessage,
  useFormikContext,
} from 'formik';
import { Modal, Button, ModalBody } from 'react-bootstrap';
import useModal from '../useModal';

const CategoryDialog = ({
  onHide,
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
      errors = await group.addCategory(group.id, values.name);
    }

    if (errors && errors.length > 0) {
      // Display the first error
      // TODO: Display all the errors?
      setErrors({ name: errors[0].title });
    }
    else {
      onHide();
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
      setErrors({ name: errors[0].title });
    }
    else {
      onHide();
    }
  };

  const Header = () => {
    let title = 'Add Category';
    if (category) {
      title = 'Edit Category';
    }

    return (
      <Modal.Header closeButton>
        <h4 id="modalTitle" className="modal-title">{title}</h4>
      </Modal.Header>
    );
  };

  const DeleteButton = () => {
    const bag = useFormikContext();

    if (category) {
      return (<Button variant="danger" onClick={() => handleDelete(bag)}>Delete</Button>);
    }

    return <div />;
  };

  const Footer = () => (
    <Modal.Footer>
      <DeleteButton />
      <div />
      <Button variant="secondary" onClick={onHide}>Cancel</Button>
      <Button variant="primary" type="submit">Save</Button>
    </Modal.Footer>
  );

  return (
    <Modal
      show={show}
      onHide={onHide}
    >
      <Formik
        initialValues={{
          name: category && category.name ? category.name : '',
        }}
        validate={handleValidate}
        onSubmit={handleSubmit}
      >
        <Form id="modalForm" className="scrollable-form">
          <Header />
          <ModalBody>
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
          </ModalBody>
          <Footer />
        </Form>
      </Formik>
    </Modal>
  );
};

CategoryDialog.propTypes = {
  category: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    update: PropTypes.func.isRequired,
  }),
  group: PropTypes.shape().isRequired,
  onHide: PropTypes.func.isRequired,
  show: PropTypes.bool.isRequired,
};

CategoryDialog.defaultProps = {
  category: undefined,
};

export const useCategoryDialog = () => useModal(CategoryDialog);

export default CategoryDialog;
