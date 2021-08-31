/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement, useEffect } from 'react';
import { Observer, observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import {
  Field, ErrorMessage, FormikErrors,
} from 'formik';
import AccountItem from './AccountItem';
import useModal, { ModalProps, UseModalType } from '../Modal/useModal';
import Institution from '../state/Institution';
import FormModal from '../Modal/FormModal';
import { TrackingType, UnlinkedAccountProps } from '../../common/ResponseTypes';
import FormTextField from '../Modal/FormTextField';

type PropsType = {
  institution: Institution,
}

const AccountsDialog = ({
  institution,
  show,
  setShow,
  onHide,
}: PropsType & ModalProps): ReactElement => {
  type ValuesType = {
    selections: UnlinkedAccountProps[] | null,
    startDate: string,
  };

  const handleValidate = (values: ValuesType) => {
    const errors: FormikErrors<ValuesType> = {};
    if (values.selections && !values.selections.some((s) => s.tracking !== 'None')) {
      errors.selections = 'No tracking options selected';
    }

    if (values.startDate === '') {
      errors.startDate = 'Start is required';
    }

    return errors;
  };

  const handleSubmit = async (values: ValuesType) => {
    if (!institution.unlinkedAccounts) {
      throw new Error('unlinkedAccounts is undefined');
    }

    const selectedAccounts = institution.unlinkedAccounts
      .map((a, i) => {
        if (values.selections === null) {
          throw new Error('account selections is null');
        }

        if (values.selections[i]) {
          return ({ ...a, tracking: values.selections[i].tracking })
        }

        return ({ ...a, tracking: 'None' as TrackingType })
      })
      .filter((a) => (a.tracking !== 'None' && a.tracking !== undefined));

    const errors = await institution.addAccounts(selectedAccounts, values.startDate);

    if (!errors) {
      setShow(false);
    }
  };

  useEffect(() => {
    institution.getUnlinkedAccounts();
  }, [institution]);

  const renderAccounts = () => (
    <>
      {
        institution.unlinkedAccounts
          ? (
            institution.unlinkedAccounts.map((acct, index) => (
              <Field
                key={acct.plaidAccountId}
                name={`selections[${index}].tracking`}
                account={acct}
                as={AccountItem}
              />
            ))
          )
          : null
      }
      <ErrorMessage name="selections" />
    </>
  );

  return (
    <FormModal<ValuesType>
      initialValues={{
        selections: toJS(institution.unlinkedAccounts),
        startDate: '',
      }}
      show={show}
      setShow={setShow}
      onHide={onHide}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title="Accounts"
      formId="UnlinkedAccounts"
    >
      <FormTextField name="startDate" label="Start Date:" type="date" />
      <Observer>
        {renderAccounts}
      </Observer>
    </FormModal>
  );
};

const observedAccountsDialog = observer(AccountsDialog);

export const useAccountsDialog = (): UseModalType<PropsType> => useModal<PropsType>(AccountsDialog);

export default observedAccountsDialog;
