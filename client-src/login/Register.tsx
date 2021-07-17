import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Modal } from 'react-bootstrap';
import { submitForm, defaultErrors, ErrorsType } from './submit';
import Waiting from './Waiting';
import RegisterPanel from './RegisterPanel';
import ResetEmailSentPanel from './ResetEmailSentPanel';

type PropTypes = {
  show: boolean;
  onHide: (() => void);
}

const Register = ({
  show,
  onHide,
}: PropTypes) => {
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [errors, setErrors] = useState(defaultErrors);
  const formRef = useRef<HTMLFormElement | null>(null);

  const handleRegister = () => {
    setWaiting(true);

    if (formRef.current === null) {
      throw new Error('form element is null')
    }

    submitForm(null, formRef.current, '/register',
      () => {
        setConfirmationSent(true);
        setWaiting(false);
      },
      (err: ErrorsType) => {
        setWaiting(false);
        setErrors({ ...defaultErrors, ...err });
      });
  };

  const handleExited = () => {
    setConfirmationSent(false);
    setErrors(defaultErrors);
  };

  let panel = (
    <RegisterPanel
      ref={formRef}
      onHide={onHide}
      onRegister={handleRegister}
      errors={errors}
    />
  );

  let title = 'Register';

  if (confirmationSent) {
    title = 'Reset Link';
    panel = (
      <ResetEmailSentPanel resetMessage="check your email" />
    );
  }

  return (
    <Modal show={show} onHide={onHide} onExited={handleExited}>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {panel}
        <Waiting show={waiting} />
      </Modal.Body>
    </Modal>
  );
};

Register.propTypes = {
  show: PropTypes.bool.isRequired,
  onHide: PropTypes.func.isRequired,
};

export default Register;
