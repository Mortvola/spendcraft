/* eslint-disable jsx-a11y/label-has-associated-control */
import React, {
  ReactElement, useCallback, useEffect, useState,
} from 'react';
// import PropTypes from 'prop-types';
import {
  Field,
  FormikHelpers,
  FormikContextType,
  FormikErrors,
} from 'formik';
import { runInAction } from 'mobx';
import useModal, { ModalProps, useModalType } from '../Modal/useModal';
import AmountInput from '../AmountInput';
import FormError from '../Modal/FormError';
import FormModal from '../Modal/FormModal';
import LoansGroup from '../state/LoansGroup';
import Category from '../state/Category';
import { Error, isLoanProps, isLoanUpdateProps } from '../../common/ResponseTypes';
import { getBody, httpGet, patchJSON } from '../state/Transports';

type Props = {
  category?: Category | null,
  group: LoansGroup,
}

const LoanDialog = ({
  onHide,
  show,
  category,
  group,
}: Props & ModalProps): ReactElement | null => {
  const [generalErrors, setGeneralErrors] = useState<string[]>();
  type ValueType = {
    name: string,
    amount: string,
    rate: string,
    startDate: string,
  }

  const [loan, setLoan] = useState<null | { startDate: string, startingBalance: number, rate: number }>(null);

  const fetchLoan = useCallback(async (categoryId: number) => {
    const result = await httpGet(`/api/loans/${categoryId}`);

    if (result.ok) {
      const body = await getBody(result);

      if (isLoanProps(body)) {
        setLoan({
          startDate: body.startDate,
          startingBalance: -body.startingBalance,
          rate: body.rate,
        });
      }
    }
  }, []);

  useEffect(() => {
    if (category) {
      fetchLoan(category.id);
    }
  }, [category, fetchLoan]);

  const handleSubmit = async (values: ValueType, bag: FormikHelpers<ValueType>) => {
    const { setErrors } = bag;
    let errors = null;

    if (category) {
      if (!loan) {
        throw new Error('loan is null');
      }

      const response = await patchJSON(`/api/loans/${category.id}`, {
        name: values.name,
        startDate: values.startDate,
        startingBalance: -parseFloat(values.amount),
        rate: parseFloat(values.rate),
      });

      if (!response.ok) {
        throw new Error('request failed');
      }

      const body = await getBody(response);

      if (isLoanUpdateProps(body)) {
        runInAction(() => {
          category.name = body.name;
          category.setLoanTransactions(body.loan);
        });
      }
    }
    else {
      errors = await group.addLoan(
        values.name,
        -parseFloat(values.amount),
        parseFloat(values.rate),
        values.startDate,
      );
    }

    if (errors && errors.length > 0) {
      // Display the first error
      // TODO: Display all the errors?
      setErrors({ [errors[0].field]: errors[0].message });
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

    if (!values.startDate || values.startDate === '') {
      errors.startDate = 'A start date must be specified.';
    }

    return errors;
  };

  const handleErrors = (context: FormikContextType<ValueType>, errors: Error[]) => {
    const { setErrors, setTouched } = context;

    if (errors[0].field.startsWith('params.')) {
      setGeneralErrors([errors[0].message]);
    }
    else {
      setTouched({ [errors[0].field]: true }, false);
      setErrors({ [errors[0].field]: errors[0].message });
    }
  }

  const handleDelete = async (context: FormikContextType<ValueType>) => {
    if (!category) {
      throw new Error('category is null or undefined');
    }

    const errors = await group.deleteCategory(category.id);

    if (errors && errors.length > 0) {
      handleErrors(context, errors);
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

  if (!category || loan) {
    return (
      <FormModal<ValueType>
        show={show}
        onHide={onHide}
        initialValues={{
          name: category && category.name ? category.name : '',
          amount: loan ? loan.startingBalance.toString() : '0',
          rate: loan ? loan.rate.toString() : '',
          startDate: loan ? loan.startDate : '',
        }}
        validate={handleValidate}
        onSubmit={handleSubmit}
        onDelete={category ? handleDelete : null}
        formId="catDialogForm"
        title={title()}
        errors={generalErrors}
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
            Start Date
            <Field type="date" name="startDate" className="form-control" />
            <FormError name="startDate" />
          </label>
        </div>
      </FormModal>
    );
  }

  return null;
};

LoanDialog.defaultProps = {
  category: undefined,
};

export const useLoanDialog = (): useModalType<Props> => useModal<Props>(LoanDialog);

export default LoanDialog;
