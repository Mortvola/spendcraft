/* eslint-disable jsx-a11y/label-has-associated-control */
import React from 'react';
import { Button, Modal } from 'react-bootstrap';
import {
  Formik, Form, Field, ErrorMessage,
  FormikErrors, FormikHelpers, useFormikContext,
  FormikContextType,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { useStores } from '../State/mobxStore';
import { FundingPlanInterface } from '../State/State';

type ValueType = {
  name: string;
}

const Header: React.FC = () => (
  <Modal.Header closeButton>
    <h4 id="modalTitle" className="modal-title">Plan</h4>
  </Modal.Header>
);

type DeleteButtonPropsType = {
  plan?: FundingPlanInterface | null,
  setShow: (show: boolean) => void,
}

const DeleteButton: React.FC<DeleteButtonPropsType> = ({ plan, setShow }) => {
  const formikBag = useFormikContext<ValueType>();
  const { plans } = useStores();

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
    else if (setShow) {
      setShow(false);
    }
  };

  if (plan) {
    return (<Button variant="danger" onClick={() => handleDelete(formikBag)}>Delete</Button>);
  }

  return <div />;
};

type FooterPropsType = {
  setShow: (show: boolean) => void,
}

const Footer: React.FC<FooterPropsType> = ({ setShow }) => (
  <Modal.Footer>
    <DeleteButton setShow={setShow} />
    <div />
    <Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button>
    <Button variant="primary" type="submit">Save</Button>
  </Modal.Footer>
);

type PropsType = {
  plan?: FundingPlanInterface | null,
}

const PlanDialog: React.FC<PropsType & ModalProps> = ({
  plan,
  setShow,
}) => {
  const { plans } = useStores();

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
    else if (setShow) {
      setShow(false);
    }
  };

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    if (values.name === '') {
      errors.name = 'The plan name must not be blank.';
    }

    return errors;
  };

  return (
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
        <Footer setShow={setShow} />
      </Form>
    </Formik>
  );
};

export const usePlanDialog = makeUseModal<PropsType>(PlanDialog);

export default PlanDialog;
