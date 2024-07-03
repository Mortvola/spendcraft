import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  Navbar,
  Nav,
  NavDropdown,
} from 'react-bootstrap';
import {
  Link, matchPath, useLocation, useNavigate,
} from 'react-router-dom';
import Http from '@mortvola/http';
import { runInAction } from 'mobx';
import { useStores } from './State/mobxStore';
import { Views } from './State/State';

enum EventKeys {
  HOME = 'HOME',
  PLANS = 'PLANS',
  ACCOUNTS = 'ACCOUNTS',
  SEARCH = 'SEARCH',
  REPORTS = 'REPORTS',
  AUTO_ASSIGN = 'AUTO_ASSIGN',
  LOGS = 'LOGS',
  ADMIN = 'ADMIN',
  LOGOUT = 'LOGOUT',
}

const pathKeys = [
  { path: '/home', key: EventKeys.HOME },
  { path: '/plans', key: EventKeys.PLANS },
  { path: '/accounts', key: EventKeys.ACCOUNTS },
  { path: '/search', key: EventKeys.SEARCH },
  { path: '/reports', key: EventKeys.REPORTS },
  { path: '/auto-assignments', key: EventKeys.AUTO_ASSIGN },
  { path: '/logs', key: EventKeys.LOGS },
  { path: '/admin', key: EventKeys.ADMIN },
]

const Menubar: React.FC = observer(() => {
  const store = useStores();
  const [expanded, setExpanded] = React.useState<boolean>(false);
  const navigate = useNavigate();
  const [active, setActive] = React.useState<EventKeys>(EventKeys.HOME);
  const location = useLocation();

  React.useEffect(() => {
    const pathKey = pathKeys.find((pk) => (
      matchPath({ path: pk.path, caseSensitive: false, end: false }, location.pathname)
    ))

    if (pathKey) {
      setActive(pathKey.key);
    }
  }, [location.pathname]);

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

  const handleSelect = (eventKey: string | null) => {
    setActive((eventKey as EventKeys) ?? EventKeys.HOME);
    setExpanded(false);
    switch (eventKey) {
      case EventKeys.LOGOUT:
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
            <Nav.Link as={Link} to="/home" eventKey={EventKeys.HOME}>Home</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link as={Link} to="/plans" eventKey={EventKeys.PLANS}>Plans</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link as={Link} to="/accounts" eventKey={EventKeys.ACCOUNTS}>Accounts</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link as={Link} to="/search" eventKey={EventKeys.SEARCH}>Search</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link as={Link} to="/reports" eventKey={EventKeys.REPORTS}>Reports</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link as={Link} to="/auto-assignments" eventKey={EventKeys.AUTO_ASSIGN}>Auto Assign</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link as={Link} to="/logs" eventKey={EventKeys.LOGS}>Logs</Nav.Link>
          </Nav.Item>
          {
            store.user.admin
              ? (
                <Nav.Item>
                  <Nav.Link as={Link} to="/admin" eventKey={EventKeys.ADMIN}>Admin</Nav.Link>
                </Nav.Item>
              )
              : null
          }
        </Nav>
        <Nav>
          <NavDropdown
            className="dropdown menubar-item"
            title={store.user.username || ''}
            id="menubar-dropdown"
            align="end"
          >
            <NavDropdown.Item as={Link} to="/user" eventKey="USER_ACCOUNT">Account</NavDropdown.Item>
            <NavDropdown.Item eventKey={EventKeys.LOGOUT}>Sign Out</NavDropdown.Item>
          </NavDropdown>
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  );
});

export default Menubar;
