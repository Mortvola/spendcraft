import React, { useContext } from 'react';
import { observer } from 'mobx-react-lite';
import {
  Navbar,
  Nav,
  NavDropdown,
} from 'react-bootstrap';
import { useHistory } from 'react-router-dom';
import MobxStore from './State/mobxStore';
import { Views } from './State/State';
import Http from '@mortvola/http';

const Menubar = () => {
  const { uiState, user: { username } } = useContext(MobxStore);
  const history = useHistory();

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
        history.push('/home');
        break;

      case 'ACCOUNTS':
        history.push('/accounts');
        break;

      case 'REPORTS':
        history.push('/reports');
        break;

      case 'PLANS':
        history.push('/plans');
        break;

      case 'USER_ACCOUNT':
        history.push('/user');
        break;

      case 'LOGOUT':
        logout();
        break;

      default:
        break;
    }

    if (eventKey && eventKey !== 'LOGOUT') {
      uiState.setView(eventKey as Views);
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
