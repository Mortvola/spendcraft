import React, { useContext } from 'react';
import { observer } from 'mobx-react-lite';
import {
  Navbar,
  Nav,
  NavDropdown,
} from 'react-bootstrap';
import { Link } from 'react-router-dom';
import Http from '@mortvola/http';
import MobxStore from './State/mobxStore';
import { Views } from './State/State';

const Menubar = () => {
  const { user: { username } } = useContext(MobxStore);

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
          <Nav.Link as={Link} to="/home">Home</Nav.Link>
          <Nav.Link as={Link} to="/plans">Plans</Nav.Link>
          <Nav.Link as={Link} to="/accounts">Accounts</Nav.Link>
          <Nav.Link as={Link} to="/reports">Reports</Nav.Link>
        </Nav>
        <Nav>
          <NavDropdown className="dropdown menubar-item" title={username || ''} id="menubar-dropdown" align="end">
            <NavDropdown.Item as={Link} to="/user">Account</NavDropdown.Item>
            <NavDropdown.Item eventKey="LOGOUT">Logout</NavDropdown.Item>
          </NavDropdown>
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  );
};

export default observer(Menubar);
