import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import 'regenerator-runtime/runtime';
import { Navbar, Nav } from 'react-bootstrap';
import Login from './login/Login';
import Register from './login/Register';

const Welcome = () => {
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleLoginHide = () => {
    setShowLogin(false);
  };

  const handleRegisterHide = () => {
    setShowRegister(false);
  };

  const handleLoad = () => {
    const body = document.querySelector('body');
    if (body === null) {
      throw new Error('body is null');
    }
  
    body.className = 'background';
    setImageLoaded(true);
  };

  let className = 'flex-center position-ref full-height';
  if (imageLoaded) {
    className += ' light';
  }
  else {
    className += ' dark';
  }

  const handleSelect = (eventKey: any) => {
    switch (eventKey) {
      case 'login':
        setShowLogin(true);
        break;

      case 'register':
        setShowRegister(true);
        break;

      default:
        break;
    }
    // uiState.setView(eventKey);
  };

  return (
    <>
      <Navbar collapseOnSelect onSelect={handleSelect} expand="md">
        <Navbar.Brand href="/">Deber-tas</Navbar.Brand>
        <Navbar.Toggle />
        <Navbar.Collapse>
          <Nav className="ml-auto">
            <Nav.Link eventKey="login">Login</Nav.Link>
            <Nav.Link eventKey="register">Register</Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Navbar>
      <div className={className}>
        <Login show={showLogin} onHide={handleLoginHide} />
        <Register show={showRegister} onHide={handleRegisterHide} />
        <img src="/coins.png" alt="" onLoad={handleLoad} style={{ display: 'none' }} />
      </div>
    </>
  );
};

ReactDOM.render(
  <Welcome />,
  document.querySelector('.app'),
);
