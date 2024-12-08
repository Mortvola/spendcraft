/* eslint-disable jsx-a11y/label-has-associated-control */
import React from 'react';
import {
  FormikErrors,
  FormikContextType,
  FieldProps,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import {
  FormField, FormModal,
} from '@mortvola/forms';
import { DateTime } from 'luxon';
import { AccountInterface } from '../State/Types';
import { ApiError, RequestErrorCode } from '../../common/ResponseTypes';
import styles from './StatementDialog.module.scss';
import AmountInput from '../AmountInput';

interface StatementInterface {
  startDate: DateTime;

  endDate: DateTime;

  startingBalance: number;

  endingBalance: number;

  delete(): Promise<null | ApiError[]>;

  update(
    props: { startDate: string, endDate: string, startingBalance: number, endingBalance: number },
  ): Promise<ApiError[] | null>
}

type PropsType = {
  statement?: StatementInterface | null,
  account?: AccountInterface | null,
  onReload?: () => void,
}

const StatementDialog: React.FC<PropsType & ModalProps> = ({
  setShow,
  statement = null,
  account = null,
  onReload,
}) => {
  type ValueType = {
    startDate: string,
    endDate: string,
    startingBalance: number,
    endingBalance: number,
  }

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    return errors;
  };

  const handleSubmit = async (values: ValueType) => {
    let errors: ApiError[] | null;
    if (statement) {
      errors = await statement.update({
        startDate: values.startDate,
        endDate: values.endDate,
        startingBalance: values.startingBalance,
        endingBalance: values.endingBalance,
      });
    }
    else {
      if (!account) {
        throw new Error('account is null');
      }

      errors = await account.addStatement(
        values.startDate,
        values.endDate,
        values.startingBalance,
        values.endingBalance,
      );
    }

    if (errors) {
      const error = errors.find((e) => (e as ApiError).code === RequestErrorCode.INCORRECT_VERSION)

      if (error) {
        setShow(false);

        if (onReload) {
          onReload();
        }
      }
    }
    else {
      setShow(false);
    }
  };

  const handleDelete = async (bag: FormikContextType<ValueType>) => {
    // const { setTouched, setErrors } = bag;

    if (statement) {
      const errors = await statement.delete();

      if (errors && errors.length > 0) {
        // setTouched({ [errors[0].field]: true }, false);
        // setFormErrors(setErrors, errors);
      }
      else {
        setShow(false);
      }
    }
  };

  return (
    <FormModal<ValueType>
      initialValues={{
        startDate: statement ? (statement.startDate.toISODate() ?? '') : '',
        endDate: statement ? (statement.endDate.toISODate() ?? '') : '',
        startingBalance: statement ? statement.startingBalance : 0,
        endingBalance: statement ? statement.endingBalance : 0,
      }}
      setShow={setShow}
      title={statement ? 'Edit Statement' : 'Add Statement'}
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={statement ? handleDelete : null}
    >
      <div className={styles.main}>
        <FormField name="startDate" type="date" label="Start Date:" />
        <FormField name="endDate" type="date" label="End Date:" />
        <FormField
          name="startingBalance"
          label="Starting Balance:"
        >
          {
            ({ field }: FieldProps<string | number, ValueType>) => (
              <AmountInput
                className="form-control"
                {...field}
              />
            )
          }
        </FormField>
        <FormField
          name="endingBalance"
          label="Ending Balance:"
        >
          {
            ({ field }: FieldProps<string | number, ValueType>) => (
              <AmountInput
                className="form-control"
                {...field}
              />
            )
          }
        </FormField>
      </div>
    </FormModal>
  );
};

export const useStatementDialog = makeUseModal<PropsType>(StatementDialog);

export default StatementDialog;
