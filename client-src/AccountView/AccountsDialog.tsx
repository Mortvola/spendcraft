/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement, useEffect } from 'react';
import PropTypes from 'prop-types';
import { observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import {
  Formik, Form, Field, ErrorMessage, FormikErrors,
} from 'formik';
import { Button, Modal } from 'react-bootstrap';
import AccountItem from './AccountItem';
import useModal, { ModalProps, useModalType } from '../Modal/useModal';
import Institution from '../state/Institution';
import FormModal from '../Modal/FormModal';
import { UnlinkedAccountProps } from '../../common/ResponseTypes';

type PropsType = {
  institution: Institution,
}

const AccountsDialog = ({
  institution,
  show,
  onHide,
}: PropsType & ModalProps): ReactElement => {

  type ValuesType = {
    selections: UnlinkedAccountProps[] | null,
  };

  const handleValidate = (values: ValuesType) => {
    const errors: FormikErrors<ValuesType> = {};
    if (values.selections && !values.selections.some((s) => s.tracking !== 'None')) {
      errors.selections = 'No tracking options selected';
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
    
        return ({ ...a, tracking: values.selections[i].tracking })
      })
      .filter((a) => (a.tracking !== 'None' && a.tracking !== undefined));

    const errors = await institution.addAccounts(selectedAccounts);

    if (!errors) {
      onHide();
    }
  };

  useEffect(() => {
    institution.getUnlinkedAccounts();
  }, [institution]);

  const renderForm = () => (
    <>
      {
        institution.unlinkedAccounts
          ? (
            institution.unlinkedAccounts.map((acct, index) => (
              <Field
                key={acct.account_id}
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
      }}
      show={show}
      onHide={onHide}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title="Accounts"
      formId="UnlinkedAccounts"
    >
      {
        renderForm()
      }
    </FormModal>
  );
};

const observedAccountsDialog = observer(AccountsDialog);

export const useAccountsDialog = (): useModalType<PropsType> => useModal<PropsType>(AccountsDialog);

export default observedAccountsDialog;
