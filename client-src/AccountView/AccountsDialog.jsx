/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import {
  Formik, Form, Field, ErrorMessage,
} from 'formik';
import { Button, Modal } from 'react-bootstrap';
import AccountItem from './AccountItem';
import useModal from '../Modal/useModal';

const AccountsDialog = ({
  institution,
  show,
  onHide,
}) => {
  const handleValidate = (values) => {
    const errors = {};
    if (!values.selections.some((s) => s !== 'None')) {
      errors.selections = 'No tracking options selected';
    }

    return errors;
  };

  const handleSubmit = async (values) => {
    const selectedAccounts = institution.unlinkedAccounts
      .map((a, i) => ({ ...a, tracking: values.selections[i].tracking }))
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
        institution.unlinkedAccounts.map((acct, index) => (
          <Field
            key={acct.account_id}
            name={`selections[${index}].tracking`}
            account={acct}
            as={AccountItem}
          />
        ))
      }
      <ErrorMessage name="selections" />
    </>
  );

  const Header = () => (
    <Modal.Header closeButton>
      <h4 id="modalTitle" className="modal-title">Accounts</h4>
    </Modal.Header>
  );

  const Footer = () => (
    <Modal.Footer>
      <div />
      <div />
      <Button variant="secondary" onClick={onHide}>Cancel</Button>
      <Button variant="primary" type="submit">Save</Button>
    </Modal.Footer>
  );

  if (institution.unlinkedAccounts) {
    return (
      <Modal show={show} onHide={onHide}>
        <Formik
          initialValues={{
            selections: toJS(institution.unlinkedAccounts),
          }}
          validate={handleValidate}
          onSubmit={handleSubmit}
        >
          <Form>
            <Header />
            <Modal.Body>
              {
                renderForm()
              }
            </Modal.Body>
            <Footer />
          </Form>
        </Formik>
      </Modal>
    );
  }

  return (
    <Modal show={show} onHide={onHide}>
      <Header />
      <Modal.Body />
      <Footer />
    </Modal>
  );
};

AccountsDialog.propTypes = {
  institution: PropTypes.shape().isRequired,
  show: PropTypes.bool.isRequired,
  onHide: PropTypes.func.isRequired,
};

const observedAccountsDialog = observer(AccountsDialog);

const useAccountsDialog = () => {
  const [DialogModal, showDialogModal] = useModal(observedAccountsDialog);

  const createAccountsDialog = (props) => (
    <DialogModal {...props} />
  );

  return [
    createAccountsDialog,
    showDialogModal,
  ];
};

export default observedAccountsDialog;
export { useAccountsDialog };
