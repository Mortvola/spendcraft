/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement } from 'react';
// import PropTypes from 'prop-types';
import {
  Formik, Form, Field,
  FormikHelpers,
  FormikContextType,
  FormikErrors,
} from 'formik';
import useModal, { ModalProps, useModalType } from '../Modal/useModal';
import Group from '../state/Group';
import Category from '../state/Category';
import AmountInput from '../AmountInput';
import FormError from '../Modal/FormError';
import FormModal from '../Modal/FormModal';

type Props = {
  category?: Category | null,
  group: Group,
}

const LoanDialog = ({
  onHide,
  show,
  category,
  group,
}: Props & ModalProps): ReactElement => {
  type ValueType = {
    name: string,
    amount: string,
    rate: string,
    numberOfPayments: string,
    paymentAmount: string,
  }

  const handleSubmit = async (values: ValueType, bag: FormikHelpers<ValueType>) => {
    const { setErrors } = bag;
    let errors = null;

    if (category) {
      errors = await category.update(group.id, values.name);
    }
    else {
      errors = await group.addLoan(
        values.name,
        parseFloat(values.amount),
        parseFloat(values.rate),
        parseFloat(values.numberOfPayments),
        parseFloat(values.paymentAmount),
      );
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

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    if (values.name === '') {
      errors.name = 'The loan name must not be blank.';
    }

    if (parseFloat(values.amount) <= 0) {
      errors.amount = 'The loan amount must be greater than zero.';
    }

    if (parseFloat(values.rate) <= 0) {
      errors.rate = 'The interset rate must be greater than zero.';
    }

    if (parseInt(values.numberOfPayments, 10) <= 0) {
      errors.numberOfPayments = 'The number of payments must be greater than zero.';
    }

    if (parseFloat(values.paymentAmount) <= 0) {
      errors.paymentAmount = 'The payment amount must be greater than zero.';
    }

    return errors;
  };

  const handleDelete = async (bag: FormikContextType<ValueType>) => {
    const { setErrors } = bag;

    if (!category) {
      throw new Error('category is null or undefined');
    }

    const errors = await group.deleteCategory(group.id, category.id);

    if (errors && errors.length > 0) {
      setErrors({ name: errors[0].title });
    }
    else {
      onHide();
    }
  };

  const title = () => {
    if (category) {
      return 'Edit Loan';
    }

    return 'Add Loan';
  };

  return (
    <FormModal<ValueType>
      show={show}
      onHide={onHide}
      initialValues={{
        name: category && category.name ? category.name : '',
        amount: '0',
        rate: '0',
        numberOfPayments: '0',
        paymentAmount: '0',
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={category ? handleDelete : null}
      formId="catDialogForm"
      title={title()}
    >
      <label style={{ display: 'block ' }}>
        Name:
        <Field
          type="text"
          className="form-control"
          name="name"
        />
        <FormError name="name" />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '2rem' }}>
        <label>
          Loan Amount:
          <Field
            as={AmountInput}
            className="form-control"
            name="amount"
          />
          <FormError name="amount" />
        </label>
        <label>
          Annual Interest Rate:
          <Field
            as={AmountInput}
            className="form-control"
            name="rate"
          />
          <FormError name="rate" />
        </label>
        <label>
          Number of Payments:
          <Field
            as={AmountInput}
            className="form-control"
            name="numberOfPayments"
          />
          <FormError name="numberOfPayments" />
        </label>
        <label>
          Payment Amount:
          <Field
            as={AmountInput}
            className="form-control"
            name="paymentAmount"
          />
          <FormError name="paymentAmount" />
        </label>
      </div>
    </FormModal>
  );
};

LoanDialog.defaultProps = {
  category: undefined,
};

export const useLoanDialog = (): useModalType<Props> => useModal<Props>(LoanDialog);

export default LoanDialog;
