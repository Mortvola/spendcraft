import {
  FormikErrors, FormikHelpers, useFormikContext,
} from 'formik';
import React from 'react';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import {
  FormField, FormModal, FormTextField, setFormErrors,
} from '@mortvola/forms';
import { AccountType, ErrorProps, TrackingType } from '../../common/ResponseTypes';
import AmountInput from '../AmountInput';
import { useStores } from '../State/Store';
import { AccountInterface, InstitutionInterface } from '../State/Types';
import AccountTypeField from './AccountTypeField';
import AccountSubtypeField from './AccountSubtypeField';

interface PropsType {
  institution?: InstitutionInterface,
  account?: AccountInterface | null,
}

interface ValuesType {
  institute: string,
  account: string,
  balance: string,
  startDate: string,
  type: string,
  subtype: string,
  tracking: TrackingType,
  rate: string,
}

const APRField = () => {
  const { values } = useFormikContext<ValuesType>();

  if (values.type === AccountType.Loan) {
    return (
      <FormField
        name="rate"
        label="Annual Percentage Rate (APR):"
        as={AmountInput}
      />
    )
  }

  return null;
}

const OfflineAccountDialog: React.FC<PropsType & ModalProps> = ({
  institution,
  account = null,
  setShow,
}) => {
  const { accounts } = useStores();

  const handleValidate = (values: ValuesType) => {
    const errors: FormikErrors<ValuesType> = {};

    if (!values.institute) {
      errors.institute = 'Institution name is required';
    }

    if (!account) {
      if (!values.account) {
        errors.account = 'Account name is required';
      }

      if (!values.startDate) {
        errors.startDate = 'Start date is required';
      }
    }

    return errors;
  };

  const handleSubmit = async (values: ValuesType, bag: FormikHelpers<ValuesType>) => {
    const { setErrors } = bag;

    let errors: ErrorProps[] | null = null;

    if (institution) {
      if (account) {
        await account.updateOfflineAccount(values.account, values.type as AccountType, values.subtype);
      }
      else {
        errors = await institution.addOfflineAccount(
          values.account,
          parseFloat(values.balance),
          values.startDate,
          values.type,
          values.subtype,
          values.tracking,
          parseFloat(values.rate),
        );
      }
    }
    else {
      errors = await accounts.addOfflineAccount(
        values.institute,
        values.account,
        parseFloat(values.balance),
        values.startDate,
        values.type,
        values.subtype,
        values.tracking,
        parseFloat(values.rate),
      );
    }

    if (errors) {
      setFormErrors(setErrors, errors);
    }
    else {
      setShow(false);
    }
  };

  const handleDelete = () => {
    if (account) {
      account.delete();
      setShow(false);
    }
  }

  return (
    <FormModal<ValuesType>
      initialValues={{
        institute: institution ? institution.name : '',
        account: account ? account.name : '',
        balance: account ? account.balance.toString() : '0',
        startDate: '',
        type: account ? account.type : AccountType.Depository,
        subtype: account ? account.subtype : 'checking',
        tracking: TrackingType.Transactions,
        rate: '0',
      }}
      setShow={setShow}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title={account ? 'Edit Offline Account' : 'Add Offline Account'}
      formId="UnlinkedAccounts"
      onDelete={account ? handleDelete : null}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(45%, 1fr))',
          gridGap: '0.5rem',
        }}
      >
        {
          !account
            ? <FormTextField name="institute" label="Institution Name:" readOnly={institution !== undefined} />
            : null
        }
        <FormTextField name="account" label="Account Name:" />
        {
          !account
            ? (
              <>
                <FormField name="balance" label="Starting Balance:" as={AmountInput} />
                <FormField name="startDate" label="Start Date:" type="date" />
                <AccountTypeField name="type" label="Account Type:" />
                <AccountSubtypeField name="subtype" label="Account Subtype:" />
                <APRField />
                <FormField name="tracking" label="Tracking:" as="select">
                  <option value="Transactions">Categorized Transactions</option>
                  <option value="Uncategorized Transactions">Uncategorized Transactions</option>
                  <option value="Balances">Balances</option>
                </FormField>
              </>
            )
            : (
              <>
                <AccountTypeField name="type" label="Account Type:" />
                <AccountSubtypeField name="subtype" label="Account Subtype:" />
              </>
            )
        }
      </div>
    </FormModal>
  );
}

export const useOfflineAccountDialog = makeUseModal<PropsType>(OfflineAccountDialog);

export default OfflineAccountDialog;
