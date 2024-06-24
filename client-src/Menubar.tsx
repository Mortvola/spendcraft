import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  Navbar,
  Nav,
  NavDropdown,
} from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import Http from '@mortvola/http';
import { runInAction } from 'mobx';
import { useStores } from './State/mobxStore';
import { Views } from './State/State';

const Menubar: React.FC = observer(() => {
  const store = useStores();
  const [expanded, setExpanded] = React.useState<boolean>(false);
  const navigate = useNavigate();
  const [active, setActive] = React.useState<string>('HOME');

  const logout = () => {
    type LogoutRequest = {
      data: {
        refresh: string | null,
      }
    }

    (async () => {
      const payload = {
        data: {
          refresh: Http.refreshToken,
        },
      };

      const response = await Http.post<LogoutRequest, void>('/api/v1/logout', payload);

      if (response.ok) {
        runInAction(() => {
          store.refresh();
        })
        Http.setTokens(null, null);
        navigate('/');
      }
    })();

    return null;
  };

  const handleSelect = (eventKey: Views | string | null) => {
    setActive(eventKey ?? 'HOME');
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
        <Nav variant="underline" defaultActiveKey="HOME" activeKey={active}>
          <Nav.Item>
            <Nav.Link as={Link} to="/home" eventKey="HOME">Home</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link as={Link} to="/plans" eventKey="PLANS">Plans</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link as={Link} to="/accounts" eventKey="ACCOUNTS">Accounts</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link as={Link} to="/search" eventKey="SEARCH">Search</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link as={Link} to="/reports" eventKey="REPORTS">Reports</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link as={Link} to="/auto-assignments" eventKey="AUTO-ASSIGN">Auto Assign</Nav.Link>
          </Nav.Item>
        </Nav>
        <Nav>
          <NavDropdown
            className="dropdown menubar-item"
            title={store.user.username || ''}
            id="menubar-dropdown"
            align="end"
          >
            <NavDropdown.Item as={Link} to="/user" eventKey="USER_ACCOUNT">Account</NavDropdown.Item>
            <NavDropdown.Item eventKey="LOGOUT">Sign Out</NavDropdown.Item>
          </NavDropdown>
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  );
});

export default Menubar;
