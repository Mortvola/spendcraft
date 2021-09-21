import React, { ReactElement } from 'react';
import { Modal, ModalBody, Button } from 'react-bootstrap';
import useModal, { ModalProps, UseModalType } from '@mortvola/usemodal';
import { AccountInterface } from './State/State';
import styles from './RelinkDialog.module.css';

type PropsType = {
  account: AccountInterface,
}

const RelinkDialog = ({
  account,
  show = false,
  setShow,
}: PropsType & ModalProps): ReactElement => {
  const handleNo = () => {
    setShow(false);
  }

  const handleYes = () => {
    setShow(false);
    account.institution.relink();
  }

  return (
    <Modal show={show}>
      <ModalBody>
        <div>
          There was a problem connecting to your account. This may occur if
          <ul>
            <li>You changed the accounts password.</li>
            <li>You changed your multi-factor authentication device, questions or answers.</li>
            <li>The institution changed its security protocols.</li>
          </ul>
          If any of these have happend, you will need to relink to your institution. Would you like to do that now?
        </div>
        <div className={styles.buttons}>
          <Button onClick={handleNo}>No</Button>
          <Button onClick={handleYes}>Yes</Button>
        </div>
      </ModalBody>
    </Modal>
  )
};

export const useRelinkDialog = (): UseModalType<PropsType> => useModal<PropsType>(RelinkDialog);
export default RelinkDialog;
