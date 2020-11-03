import React from 'react';
import { connect } from 'react-redux';
import { Nav } from 'react-bootstrap';
import PropTypes from 'prop-types';
import { report } from '../redux/actions';
import NetWorth from './NetWorth';

const mapStateToProps = (state) => ({
  reportType: state.reports.reportType,
  data: state.reports.data,
});

const Reports = ({
  reportType,
  data,
  dispatch,
}) => {
  const handleSelect = (eventKey) => {
    dispatch(report(eventKey));
  };

  const renderReport = () => {
    switch (reportType) {
      case 'netWorth':
        return <NetWorth balances={data} />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="side-bar">
        <Nav className="flex-column" onSelect={handleSelect}>
          <Nav.Link eventKey="netWorth">Net Worth</Nav.Link>
        </Nav>
      </div>
      {renderReport()}
    </>
  );
};

Reports.propTypes = {
  reportType: PropTypes.string.isRequired,
  data: PropTypes.shape().isRequired,
  dispatch: PropTypes.func.isRequired,
};

export default connect(mapStateToProps)(Reports);
