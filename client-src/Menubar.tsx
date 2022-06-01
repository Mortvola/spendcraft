import React, { useContext } from 'react';
import { observer } from 'mobx-react-lite';
import {
  Navbar,
  Nav,
  NavDropdown,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import Http from '@mortvola/http';
import MobxStore from './State/mobxStore';
import { Views } from './State/State';

const Menubar = () => {
  const { user: { username } } = useContext(MobxStore);
  const navigate = useNavigate();

  const logout = () => {
    (async () => {
      const response = await Http.post('/api/logout');

      if (response.ok) {
        window.location.replace('/');
      }
    })();

    return null;
  };

  const handleSelect = (eventKey: Views | string | null) => {
    switch (eventKey) {
      case 'HOME':
        navigate('/home');
        break;

      case 'ACCOUNTS':
        navigate('/accounts');
        break;

      case 'REPORTS':
        navigate('/reports');
        break;

      case 'PLANS':
        navigate('/plans');
        break;

      case 'USER_ACCOUNT':
        navigate('/user');
        break;

      case 'LOGOUT':
        logout();
        break;

      default:
        break;
    }
  };

  return (
    <Navbar collapseOnSelect onSelect={handleSelect} expand="md" style={{ userSelect: 'none' }}>
      <Navbar.Brand href="/">SpendCraft</Navbar.Brand>
      <Navbar.Toggle />
      <Navbar.Collapse style={{ justifyContent: 'space-between' }}>
        <Nav>
          <Nav.Link eventKey="HOME">Home</Nav.Link>
          <Nav.Link eventKey="PLANS">Plans</Nav.Link>
          <Nav.Link eventKey="ACCOUNTS">Accounts</Nav.Link>
          <Nav.Link eventKey="REPORTS">Reports</Nav.Link>
        </Nav>
        <Nav>
          <NavDropdown className="dropdown menubar-item" title={username || ''} id="menubar-dropdown" align="end">
            <NavDropdown.Item eventKey="USER_ACCOUNT">Account</NavDropdown.Item>
            <NavDropdown.Item eventKey="LOGOUT">Logout</NavDropdown.Item>
          </NavDropdown>
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  );
};

export default observer(Menubar);
