/* eslint-disable jsx-a11y/label-has-associated-control */
import React from 'react';
import {
  FormikErrors,
  FormikContextType,
  FormikHelpers,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { FormModal, FormField, setFormErrors } from '@mortvola/forms';
import { BalanceInterface, BalancesInterface } from '../State/Types';
import AmountInput from '../AmountInput';
import styles from './BalanceDialog.module.scss';
import { ApiError } from '../../common/ResponseTypes';

type PropsType = {
  balance?: BalanceInterface | null,
  balances?: BalancesInterface | null,
}

const BalanceDialog: React.FC<PropsType & ModalProps> = ({
  setShow,
  balance = null,
  balances = null,
}) => {
  type FormValues = {
    date: string,
    amount: number,
  }

  const handleValidate = () => {
    const errors: FormikErrors<FormValues> = {};

    return errors;
  };

  const handleSubmit = async (values: FormValues, { setErrors }: FormikHelpers<FormValues>) => {
    const amount = typeof values.amount === 'string' ? parseFloat(values.amount) : values.amount;

    let errors: ApiError[] | null = null;
    if (balance) {
      errors = await balance.update({
        date: values.date,
        amount,
      });
    }
    else {
      if (!balances) {
        throw new Error('account is null');
      }

      errors = await balances.addBalance({
        date: values.date,
        amount,
      });
    }

    if (errors) {
      setFormErrors(
        setErrors,
        errors
          .filter((error) => error.source)
          .map((error) => ({ field: error.source!.pointer, message: error.detail })),
      );
    }
    else {
      setShow(false);
    }
  };

  const handleDelete = async (bag: FormikContextType<FormValues>) => {
    const { setErrors } = bag;

    if (balance) {
      const errors = await balance.delete();

      if (errors) {
        setFormErrors(setErrors, errors);
      }
      else {
        setShow(false);
      }
    }
  };

  return (
    <FormModal<FormValues>
      initialValues={{
        date: balance ? (balance.date.toISODate() ?? '') : '',
        amount: balance ? balance.balance : 0,
      }}
      setShow={setShow}
      title={balance ? 'Edit Balance' : 'Add Balance'}
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={balance ? handleDelete : null}
    >
      <div className={styles.main}>
        <FormField type="date" name="date" label="Date:" />
        <FormField as={AmountInput} name="amount" label="Amount:" />
      </div>
    </FormModal>
  );
};

export const useBalanceDialog = makeUseModal<PropsType>(BalanceDialog);

export default BalanceDialog;
