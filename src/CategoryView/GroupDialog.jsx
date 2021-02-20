/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useContext } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, ModalBody } from 'react-bootstrap';
import {
  Formik, Form, Field, ErrorMessage,
  useFormikContext,
} from 'formik';
import MobxStore from '../state/mobxStore';
import useModal from '../useModal';

const GroupDialog = ({
  onHide,
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
      onHide();
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
      setTouched({ name: true }, false);
      setErrors({ name: errors[0].title });
    }
    else {
      onHide();
    }
  };

  const Header = () => {
    let title = 'Add Group';
    if (group) {
      title = 'Edit Group';
    }

    return (
      <Modal.Header closeButton>
        <h4 id="modalTitle" className="modal-title">{title}</h4>
      </Modal.Header>
    );
  };

  const DeleteButton = () => {
    const bag = useFormikContext();

    if (group) {
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
          name: group && group.name ? group.name : '',
        }}
        validate={handleValidate}
        onSubmit={handleSubmit}
      >
        <Form id="modalForm" className="scrollable-form">
          <Header />
          <ModalBody>
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
          </ModalBody>
          <Footer />
        </Form>
      </Formik>
    </Modal>
  );
};

GroupDialog.propTypes = {
  group: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    update: PropTypes.func.isRequired,
  }),
  onHide: PropTypes.func.isRequired,
  show: PropTypes.bool.isRequired,
};

GroupDialog.defaultProps = {
  group: undefined,
};

export const useGroupDialog = () => useModal(GroupDialog);

export default GroupDialog;
