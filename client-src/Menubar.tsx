import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  Navbar,
  Nav,
  NavDropdown,
} from 'react-bootstrap';
import { Link } from 'react-router-dom';
import Http from '@mortvola/http';
import { useStores } from './State/mobxStore';
import { Views } from './State/State';

const Menubar: React.FC = observer(() => {
  const { user: { username } } = useStores();
  const [expanded, setExpanded] = React.useState<boolean>(false);

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
    setExpanded(false);
    switch (eventKey) {
      case 'LOGOUT':
        logout();
        break;

      default:
        break;
    }
  };

  const handleToggle = (expand: boolean) => {
    setExpanded(expand);
  };

  return (
    <Navbar
      onSelect={handleSelect}
      onToggle={handleToggle}
      expand="md"
      expanded={expanded}
      style={{ userSelect: 'none' }}
    >
      <Navbar.Brand href="/">SpendCraft</Navbar.Brand>
      <Navbar.Toggle />
      <Navbar.Collapse style={{ justifyContent: 'space-between' }}>
        <Nav>
          <Nav.Link as={Link} to="/home" eventKey="NOOP">Home</Nav.Link>
          <Nav.Link as={Link} to="/plans" eventKey="NOOP">Plans</Nav.Link>
          <Nav.Link as={Link} to="/accounts" eventKey="NOOP">Accounts</Nav.Link>
          <Nav.Link as={Link} to="/reports" eventKey="NOOP">Reports</Nav.Link>
        </Nav>
        <Nav>
          <NavDropdown className="dropdown menubar-item" title={username || ''} id="menubar-dropdown" align="end">
            <NavDropdown.Item as={Link} to="/user" eventKey="NOOP">Account</NavDropdown.Item>
            <NavDropdown.Item eventKey="LOGOUT">Logout</NavDropdown.Item>
          </NavDropdown>
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  );
});

export default Menubar;
