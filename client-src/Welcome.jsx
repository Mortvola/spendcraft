import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import 'regenerator-runtime/runtime';
import Login from './login/Login';
import Register from './login/Register';

const Welcome = () => {
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const handleLoginClick = () => {
    setShowLogin(true);
  };

  const handleLoginHide = () => {
    setShowLogin(false);
  };

  const handleRegisterClick = () => {
    setShowRegister(true);
  };

  const handleRegisterHide = () => {
    setShowRegister(false);
  };

  const className = 'flex-center position-ref full-height';

  return (
    <div className={className}>
      <div className="top-right links">
        <div className="welcome-button" onClick={handleLoginClick}>Login</div>
        <div className="welcome-button" onClick={handleRegisterClick}>Register</div>
      </div>
      <Login show={showLogin} onHide={handleLoginHide} />
      <Register show={showRegister} onHide={handleRegisterHide} />
    </div>
  );
};

ReactDOM.render(
  <Welcome />,
  document.querySelector('.app'),
);
