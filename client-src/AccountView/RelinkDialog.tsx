import React from 'react';
import { ModalBody, Button } from 'react-bootstrap';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { AccountInterface } from '../State/State';
import styles from './RelinkDialog.module.css';

type PropsType = {
  account: AccountInterface,
}

const RelinkDialog: React.FC<PropsType & ModalProps> = ({
  account,
  setShow,
}) => {
  const handleNo = () => {
    setShow(false);
  }

  const handleYes = () => {
    setShow(false);
    account.institution.relink();
  }

  return (
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
  )
};

export const useRelinkDialog = makeUseModal<PropsType>(RelinkDialog);
export default RelinkDialog;
