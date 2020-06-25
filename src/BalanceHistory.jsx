import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import Chart from 'react-google-charts';

const mapStateToProps = (state) => ({
    balances: state.balances,
});

const BalanceHistory = ({
    balances,
}) => {
    const data = balances.map((b) => [b.date, b.balance]);
    data.splice(0, 0, ['date', 'balance']);

    return (
        <div className="chart-wrapper">
            <Chart
                chartType="LineChart"
                data={data}
                options={{
                    width: '100%',
                    height: '100%',
                    legend: { position: 'none' },
                    hAxis: {
                        slantedText: true,
                    },
                }}
            />
        </div>
    );
};

BalanceHistory.propTypes = {
    balances: PropTypes.arrayOf(PropTypes.shape()).isRequired,
};

export default connect(mapStateToProps)(BalanceHistory);
