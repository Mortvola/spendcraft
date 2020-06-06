import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import {
    Navbar,
    Container,
    Nav,
    NavDropdown,
} from 'react-bootstrap';
import { navigate } from './redux/actions';

const Menubar = ({ dispatch }) => {
    const handleSelect = (eventKey) => {
        dispatch(navigate(eventKey));
    };

    return (
        <Navbar onSelect={handleSelect}>
            <Container>
                <Navbar.Brand eventKey="home" href="/">debertas</Navbar.Brand>

                <div className="collapse navbar-collapse">
                    <Nav className="mr-auto">
                        <Nav.Link eventKey="home">Home</Nav.Link>
                        <Nav.Link eventKey="plans">Plans</Nav.Link>
                        <Nav.Link eventKey="accounts">Accounts</Nav.Link>
                        <Nav.Link eventKey="reports">Reports</Nav.Link>
                    </Nav>
                    <Nav className="ml-auto">
                        <NavDropdown className="dropdown menubar-item" title="Mortvola">
                            <NavDropdown.Item eventKey="account">Account</NavDropdown.Item>
                            <NavDropdown.Item eventKey="logout">Logout</NavDropdown.Item>
                        </NavDropdown>
                    </Nav>
                </div>
            </Container>
        </Navbar>
    );
};

Menubar.propTypes = {
    dispatch: PropTypes.func.isRequired,
};

export default connect()(Menubar);
