/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useContext } from 'react';
import PropTypes from 'prop-types';
import { Button, Modal } from 'react-bootstrap';
import {
  Formik, Form, Field, ErrorMessage,
} from 'formik';
import MobxStore from '../state/mobxStore';
import useModal from '../useModal';

const PlanDialog = ({
  plan,
  show,
  onHide,
}) => {
  const { plans } = useContext(MobxStore);

  const handleSubmit = async (values, bag) => {
    const { setErrors } = bag;
    let errors = null;

    if (plan) {
      errors = await plan.update(values.name);
    }
    else {
      errors = await plans.addPlan(values.name);
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
      errors.name = 'The plan name must not be blank.';
    }

    return errors;
  };

  const handleDelete = async (bag) => {
    const { setTouched, setErrors } = bag;

    const errors = await plans.deletePlan(plan.id);

    if (errors && errors.length > 0) {
      // Display the first error
      // TODO: Display all the errors?
      setTouched({ name: true }, false);
      setErrors({ name: errors[0].title });
    }
    else {
      onHide();
    }
  };

  const Header = () => (
    <Modal.Header closeButton>
      <h4 id="modalTitle" className="modal-title">Plan</h4>
    </Modal.Header>
  );

  const DeleteButton = () => {
    if (plan) {
      return (<Button variant="danger" onClick={handleDelete}>Delete</Button>);
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
    <Modal show={show} onHide={onHide}>
      <Formik
        initialValues={{
          name: plan && plan.name ? plan.name : '',
        }}
        validate={handleValidate}
        onSubmit={handleSubmit}
      >
        <Form>
          <Header />
          <Modal.Body>
            <label>
              Plan Name:
              <Field
                type="text"
                className="form-control"
                name="name"
              />
            </label>
            <br />
            <ErrorMessage name="name" />
          </Modal.Body>
          <Footer />
        </Form>
      </Formik>
    </Modal>
  );
};

PlanDialog.propTypes = {
  plan: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    update: PropTypes.func.isRequired,
  }),
  onHide: PropTypes.func.isRequired,
  show: PropTypes.bool.isRequired,
};

PlanDialog.defaultProps = {
  plan: undefined,
};

const usePlanDialog = () => useModal(PlanDialog);

export default PlanDialog;
export { usePlanDialog };
