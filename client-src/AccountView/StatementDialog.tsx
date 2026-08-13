import React from 'react';
import {
  FormikErrors,
  FormikContextType,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import {
  FormField, FormModal,
} from '@mortvola/forms';
import { AccountInterface, StatementInterface } from '../State/Types';
import { AccountType, ApiError, RequestErrorCode } from '../../common/ResponseTypes';
import styles from './StatementDialog.module.scss';
import AmountField from '../AmountField';

interface PropsType {
  statement?: StatementInterface | null,
  account: AccountInterface,
  onReload?: () => void,
}

const StatementDialog: React.FC<PropsType & ModalProps> = ({
  setShow,
  statement = null,
  account,
  onReload,
}) => {
  interface ValueType {
    startDate: string,
    endDate: string,
    startingBalance: number,
    endingBalance: number,
    shortTermGains: number,
    longTermGains: number,
    dividends: number,
    taxableInterest: number,
  }

  const handleValidate = (_values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    return errors;
  };

  const handleSubmit = async (values: ValueType) => {
    let errors: ApiError[] | null;
    if (statement) {
      errors = await statement.update({
        startDate: values.startDate,
        endDate: values.endDate,
        startingBalance: values.startingBalance * account.sign,
        endingBalance: values.endingBalance * account.sign,
        data: {
          shortTermCapitalGains: typeof values.shortTermGains == 'string' ? parseFloat(values.shortTermGains) : values.shortTermGains,
          longTermCapitalGains: typeof values.longTermGains === 'string' ? parseFloat(values.longTermGains) : values.longTermGains,
          dividends: typeof values.dividends === 'string' ? parseFloat(values.dividends) : values.dividends,
          taxableInterest: typeof values.taxableInterest === 'string' ? parseFloat(values.taxableInterest) : values.taxableInterest,
        }
      });
    }
    else {
      errors = await account.statements.addStatement(
        values.startDate,
        values.endDate,
        values.startingBalance * account.sign,
        values.endingBalance * account.sign,
        typeof values.shortTermGains == 'string' ? parseFloat(values.shortTermGains) : values.shortTermGains,
        typeof values.longTermGains === 'string' ? parseFloat(values.longTermGains) : values.longTermGains,
        typeof values.dividends === 'string' ? parseFloat(values.dividends) : values.dividends,
        typeof values.taxableInterest === 'string' ? parseFloat(values.taxableInterest) : values.taxableInterest,
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

  const handleDelete = async (_bag: FormikContextType<ValueType>) => {
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
        startingBalance: statement ? statement.startingBalance * account.sign : 0,
        endingBalance: statement ? statement.endingBalance * account.sign : 0,
        shortTermGains: statement?.shortTermGains ?? 0,
        longTermGains: statement?.longTermGains ?? 0,
        dividends: statement?.dividends ?? 0,
        taxableInterest: statement?.taxableInterest ?? 0,
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
        <AmountField name="startingBalance" label="Starting Balance:" />
        <AmountField name="endingBalance" label="Ending Balance:" />

        {
          account.type === AccountType.Investment
            ? (
              <>
                <AmountField name="taxableInterest" label="Taxable Interest:" />
                <AmountField name="dividends" label="Dividends:" />
                <AmountField name="shortTermGains" label="Short-term Gains:" />
                <AmountField name="longTermGains" label="Long-term Gains:" />
              </>
            )
            : null
        }
      </div>
    </FormModal>
  );
};

export const useStatementDialog = makeUseModal<PropsType>(StatementDialog);

export default StatementDialog;
