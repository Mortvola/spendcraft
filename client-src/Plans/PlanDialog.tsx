/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement, useContext } from 'react';
// import PropTypes from 'prop-types';
import { Button, Modal, ModalProps } from 'react-bootstrap';
import {
  Formik, Form, Field, ErrorMessage,
  FormikErrors, FormikHelpers, useFormikContext,
  FormikContextType,
} from 'formik';
import MobxStore from '../state/mobxStore';
import useModal from '../Modal/useModal';
import { FundingPlanInterface } from '../state/State';

interface Props {
  plan?: FundingPlanInterface | null,
}

const PlanDialog = ({
  plan,
  show,
  onHide,
}: Props & ModalProps): ReactElement => {
  const { plans } = useContext(MobxStore);

  type ValueType = {
    name: string;
  }

  const handleSubmit = async (values: ValueType, bag: FormikHelpers<ValueType>) => {
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
      setErrors({ name: errors[0].message });
    }
    else if (onHide) {
      onHide();
    }
  };

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    if (values.name === '') {
      errors.name = 'The plan name must not be blank.';
    }

    return errors;
  };

  const handleDelete = async (bag: FormikContextType<ValueType>) => {
    const { setTouched, setErrors } = bag;

    if (!plan) {
      throw new Error('plan is null');
    }

    const errors = await plans.deletePlan(plan.id);

    if (errors && errors.length > 0) {
      // Display the first error
      // TODO: Display all the errors?
      setTouched({ name: true }, false);
      setErrors({ name: errors[0].message });
    }
    else if (onHide) {
      onHide();
    }
  };

  const Header = () => (
    <Modal.Header closeButton>
      <h4 id="modalTitle" className="modal-title">Plan</h4>
    </Modal.Header>
  );

  const DeleteButton = () => {
    const bag = useFormikContext<ValueType>();

    if (plan) {
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
    <Modal show={show} onHide={onHide}>
      <Formik<ValueType>
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

PlanDialog.defaultProps = {
  plan: null,
};

export const usePlanDialog = (): [
  (props: Props) => (ReactElement | null),
  () => void,
] => useModal<Props>(PlanDialog);

export default PlanDialog;
