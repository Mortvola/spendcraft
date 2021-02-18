import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Modal } from 'react-bootstrap';
import { submitForm, defaultErrors } from './submit';
import LoginPanel from './LoginPanel';
import ForgotPasswordPanel from './ForgotPasswordPanel';
import ResetEmailSentPanel from './ResetEmailSentPanel';
import Waiting from './Waiting';

const Login = ({
  show,
  onHide,
}) => {
  const [card, setCard] = useState('login');
  const [resetMessage, setResetMessage] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [errors, setErrors] = useState(defaultErrors);
  const formRef = useRef(null);

  const handleForgotPasswordClick = () => {
    setCard('forgot');
  };

  const handleRememberedPasswordClick = () => {
    setCard('login');
  };

  const handleLogin = () => {
    setWaiting(true);
    submitForm(null, formRef.current, '/login',
      (responseText) => {
        if (responseText) {
          setWaiting(false);
          window.location.assign(responseText);
        }
      },
      (err) => {
        setWaiting(false);
        setErrors({ ...defaultErrors, ...err });
      });
  };

  const requestResetLink = (event) => {
    setWaiting(true);
    submitForm(event, formRef.current, '/password/email',
      (responseText) => {
        setResetMessage(responseText);
        setCard('reset');
        setWaiting(false);
      },
      (err) => {
        setWaiting(false);
        setErrors({ ...defaultErrors, ...err });
      });
  };

  const handleExited = () => {
    setCard('login');
    setResetMessage('');
    setErrors(defaultErrors);
  };

  let title = 'Login';
  let panel = (
    <LoginPanel
      ref={formRef}
      onHide={onHide}
      onLogin={handleLogin}
      onForgotPasswordClick={handleForgotPasswordClick}
      errors={errors}
    />
  );

  switch (card) {
    case 'forgot':
      title = 'Forgot Password';
      panel = (
        <ForgotPasswordPanel
          ref={formRef}
          onHide={onHide}
          onRememberedPasswordClick={handleRememberedPasswordClick}
          requestResetLink={requestResetLink}
          errors={errors}
        />
      );
      break;
    case 'reset':
      title = 'Reset Link';
      panel = (
        <ResetEmailSentPanel resetMessage={resetMessage} errors={errors} />
      );
      break;
    default:
      title = 'Login';
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

Login.propTypes = {
  show: PropTypes.bool.isRequired,
  onHide: PropTypes.func.isRequired,
};

export default Login;
