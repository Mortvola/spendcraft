import { FormikErrors, FormikHelpers } from 'formik';
import React, { ReactElement, useContext } from 'react';
import { Error } from '../../common/ResponseTypes';
import AmountInput from '../AmountInput';
import FormModal from '../Modal/FormModal';
import FormTextField from '../Modal/FormTextField';
import useModal, { ModalProps, useModalType } from '../Modal/useModal';
import Institution from '../state/Institution';
import MobxStore from '../state/mobxStore';
import { AccountInterface } from '../state/State';

type PropsType = {
  institution?: Institution,
  account?: AccountInterface | null,
  onHide?: () => void,
}

const OfflineAccountDialog = ({
  institution,
  account = null,
  show,
  setShow,
  onHide,
}: PropsType & ModalProps): ReactElement => {
  const { accounts } = useContext(MobxStore);

  type ValuesType = {
    institute: string,
    account: string,
    balance: string,
    startDate: string,
  };

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

    let errors: Error[] | null = null;

    if (institution) {
      if (account) {
        await account.updateOfflineAccount(values.account);
      }
      else {
        errors = await institution.addOfflineAccount(values.account, parseFloat(values.balance), values.startDate);
      }
    }
    else {
      errors = await accounts.addOfflineAccount(
        values.institute, values.account, parseFloat(values.balance), values.startDate,
      );
    }

    if (errors) {
      setErrors({ [errors[0].field]: errors[0].message });
    }
    else {
      setShow(false);
    }
  };

  const handleDelete = () => {
    if (account) {
      account.delete();
    }
  }

  return (
    <FormModal<ValuesType>
      initialValues={{
        institute: institution ? institution.name : '',
        account: account ? account.name : '',
        balance: account ? account.balance.toString() : '0',
        startDate: '',
      }}
      show={show}
      setShow={setShow}
      onHide={onHide}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title="Add Offline Account"
      formId="UnlinkedAccounts"
      size="sm"
      onDelete={account ? handleDelete : null}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <FormTextField name="institute" label="Institution Name:" readOnly={institution !== undefined} />
        <FormTextField name="account" label="Account Name:" />
        {
          !account
            ? (
              <>
                <FormTextField name="balance" label="Starting Balance:" as={AmountInput} />
                <FormTextField name="startDate" label="Start Date:" type="date" />
              </>
            )
            : null
        }
      </div>
    </FormModal>
  );
}

export const useOfflineAccountDialog = (): useModalType<PropsType> => useModal<PropsType>(OfflineAccountDialog);

export default OfflineAccountDialog;
