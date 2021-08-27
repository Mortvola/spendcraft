import { FormikErrors, FormikHelpers } from 'formik';
import React, { ReactElement, useContext } from 'react';
import { Error } from '../../common/ResponseTypes';
import AmountInput from '../AmountInput';
import FormModal from '../Modal/FormModal';
import FormTextField from '../Modal/FormTextField';
import useModal, { ModalProps, useModalType } from '../Modal/useModal';
import Institution from '../state/Institution';
import MobxStore from '../state/mobxStore';

type PropsType = {
  institution?: Institution,
}

const OfflineAccountDialog = ({
  institution,
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

    if (!values.account) {
      errors.account = 'Account name is required';
    }

    if (!values.startDate) {
      errors.startDate = 'Start date is required';
    }

    return errors;
  };

  const handleSubmit = async (values: ValuesType, bag: FormikHelpers<ValuesType>) => {
    const { setErrors } = bag;

    let errors: Error[] | null = null;

    if (institution) {
      errors = await institution.addOfflineAccount(values.account, parseFloat(values.balance), values.startDate);
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

  return (
    <FormModal<ValuesType>
      initialValues={{
        institute: institution ? institution.name : '',
        account: '',
        balance: '0',
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
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <FormTextField name="institute" readOnly={institution !== undefined}>
          Institution Name:
        </FormTextField>
        <FormTextField name="account">
          Account Name:
        </FormTextField>
        <FormTextField name="balance" as={AmountInput}>
          Starting Balance:
        </FormTextField>
        <FormTextField name="startDate" type="date">
          Starting Balance:
        </FormTextField>
      </div>
    </FormModal>
  );
}

export const useOfflineAccountDialog = (): useModalType<PropsType> => useModal<PropsType>(OfflineAccountDialog);

export default OfflineAccountDialog;
