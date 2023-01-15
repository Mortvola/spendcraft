import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Modal } from 'react-bootstrap';
import { submitForm, defaultErrors, ErrorsType } from './submit';
import Waiting from './Waiting';
import RegisterPanel from './RegisterPanel';
import ResetEmailSentPanel from './ResetEmailSentPanel';

type PropsType = {
  show: boolean;
  onHide: (() => void);
}

const Register: React.FC<PropsType> = ({
  show,
  onHide,
}) => {
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [errors, setErrors] = useState(defaultErrors);
  const formRef = useRef<HTMLFormElement | null>(null);

  const handleRegister = () => {
    setWaiting(true);

    if (formRef.current === null) {
      throw new Error('form element is null');
    }

    submitForm(
      null,
      formRef.current,
      '/api/register',
      () => {
        setConfirmationSent(true);
        setWaiting(false);
      },
      (err: ErrorsType) => {
        setWaiting(false);
        setErrors({ ...defaultErrors, ...err });
      },
    );
  };

  const handleExited = () => {
    setConfirmationSent(false);
    setErrors(defaultErrors);
  };

  let title = 'Register';

  const panel = () => {
    if (confirmationSent) {
      const resetMessage = 'We sent an email to your email address for '
        + 'email verification. Click on the link and then return here to log in.';
      title = 'Reset Link';
      return <ResetEmailSentPanel resetMessage={resetMessage} />;
    }

    return (
      <RegisterPanel
        ref={formRef}
        onHide={onHide}
        onRegister={handleRegister}
        errors={errors}
      />
    );
  };

  return (
    <Modal show={show} onHide={onHide} onExited={handleExited}>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {panel()}
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
