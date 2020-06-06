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
                        <Nav.Link eventKey="home" style={{ color: 'white' }}>Home</Nav.Link>
                        <Nav.Link eventKey="fundingplans" style={{ color: 'white' }}>Funding Plans</Nav.Link>
                        <Nav.Link eventKey="accounts" style={{ color: 'white' }}>Accounts</Nav.Link>
                    </Nav>
                    <Nav className="ml-auto">
                        <NavDropdown className="dropdown" title="Mortvola">
                            <NavDropdown.Item eventKey="Account">Account</NavDropdown.Item>
                            <NavDropdown.Item eventKey="Logout">Logout</NavDropdown.Item>
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
