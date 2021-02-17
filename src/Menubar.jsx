import React, { useContext } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import {
  Navbar,
  Nav,
  NavDropdown,
} from 'react-bootstrap';
import MobxStore from './redux/mobxStore';

const mapStateToProps = (state) => ({
  username: state.user ? state.user.username : '',
});

const Menubar = ({ username }) => {
  const { uiState } = useContext(MobxStore);

  const handleSelect = (eventKey) => {
    uiState.view = eventKey;
  };

  return (
    <Navbar collapseOnSelect onSelect={handleSelect} expand="md">
      <Navbar.Brand href="/">Deber-tas</Navbar.Brand>
      <Navbar.Toggle />
      <Navbar.Collapse>
        <Nav className="mr-auto">
          <Nav.Link eventKey="home">Home</Nav.Link>
          <Nav.Link eventKey="plans">Plans</Nav.Link>
          <Nav.Link eventKey="accounts">Accounts</Nav.Link>
          <Nav.Link eventKey="reports">Reports</Nav.Link>
        </Nav>
        <Nav className="ml-auto">
          <NavDropdown className="dropdown menubar-item" title={username}>
            <Nav.Link eventKey="account">Account</Nav.Link>
            <Nav.Link eventKey="logout">Logout</Nav.Link>
          </NavDropdown>
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  );
};

Menubar.propTypes = {
  username: PropTypes.string.isRequired,
};

export default connect(mapStateToProps)(Menubar);
