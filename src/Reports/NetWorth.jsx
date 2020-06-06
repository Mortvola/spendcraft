import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import Chart from 'react-google-charts';

const mapStateToProps = (state) => ({
    balances: state.reports.data,
});

const Networth = ({
    balances,
}) => (
    <div className="chart-wrapper">
        <Chart
            chartType="ColumnChart"
            data={balances}
            options={{
                width: '100%',
                height: '100%',
                legend: { position: 'none' },
                isStacked: true,
            }}
        />
    </div>
);

Networth.propTypes = {
    balances: PropTypes.arrayOf(PropTypes.shape()).isRequired,
};

export default connect(mapStateToProps)(Networth);
