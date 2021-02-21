import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Modal } from 'react-bootstrap';
import { submitForm, defaultErrors } from './submit';
import Waiting from './Waiting';
import RegisterPanel from './RegisterPanel';
import ResetEmailSentPanel from './ResetEmailSentPanel';

const Register = ({
  show,
  onHide,
}) => {
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [errors, setErrors] = useState(defaultErrors);
  const formRef = useRef(null);

  const handleRegister = () => {
    setWaiting(true);
    submitForm(null, formRef.current, '/register',
      () => {
        setConfirmationSent(true);
        setWaiting(false);
      },
      (err) => {
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
      <ResetEmailSentPanel ref={formRef} resetMessage="check your email" errors={errors} />
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
