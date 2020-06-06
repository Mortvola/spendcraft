import React from 'react';
import { connect } from 'react-redux';
import { Nav } from 'react-bootstrap';
import PropTypes from 'prop-types';
import { report } from '../redux/actions';
import NetWorth from './NetWorth';

const Reports = ({
    dispatch,
}) => {
    const handleSelect = (eventKey) => {
        dispatch(report(eventKey));
    };

    return (
        <>
            <div className="side-bar">
                <Nav className="flex-column" onSelect={handleSelect}>
                    <Nav.Link eventKey="netWorth">Net Worth</Nav.Link>
                </Nav>
            </div>
            <NetWorth />
        </>
    );
};

Reports.propTypes = {
    dispatch: PropTypes.func.isRequired,
};

export default connect()(Reports);
