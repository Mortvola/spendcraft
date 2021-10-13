/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement } from 'react';
import {
  FormikErrors,
  FormikContextType,
  FormikHelpers,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { BalanceInterface, BalancesInterface } from '../State/State';
import AmountInput from '../AmountInput';
import FormModal from '../Modal/FormModal';
import FormField from '../Modal/FormField';
import styles from './BalanceDialog.module.css';
import { setFormErrors } from '../Modal/Errors';

type PropsType = {
  balance?: BalanceInterface | null,
  balances?: BalancesInterface | null,
}

const BalanceDialog = ({
  setShow,
  balance = null,
  balances = null,
}: PropsType & ModalProps): ReactElement => {
  type FormValues = {
    date: string,
    amount: number,
  }

  const handleValidate = (values: FormValues) => {
    const errors: FormikErrors<FormValues> = {};

    return errors;
  };

  const handleSubmit = async (values: FormValues, { setErrors }: FormikHelpers<FormValues>) => {
    const amount = typeof values.amount === 'string' ? parseFloat(values.amount) : values.amount;

    let errors;
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
      setFormErrors(setErrors, errors);
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
        date: balance ? balance.date.toISODate() : '',
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
