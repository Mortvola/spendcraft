import React from 'react';
import PropTypes from 'prop-types';
import Chart from 'react-google-charts';

const Networth = ({
    balances,
}) => {
    const data = balances.map((item, index) => {
        if (index === 0) {
            return item.concat([{ role: 'annotation' }, { role: 'annotationText' }]);
        }

        return item.concat(['T', item.reduce((accum, balance, index2) => {
            if (index2 === 0 || balance === null || Number.isNaN(balance)) {
                return accum;
            }

            return accum + balance;
        }, 0)]);
    });

    return (
        <div className="chart-wrapper">
            <Chart
                chartType="ColumnChart"
                data={data}
                options={{
                    width: '100%',
                    height: '100%',
                    legend: { position: 'none' },
                    isStacked: true,
                    hAxis: {
                        slantedText: true,
                    },
                    annotations: {
                        style: 'point',
                        textStyle: {
                            opacity: 0,
                        },
                        stem: {
                            length: 0,
                        },
                    },
                    focusTarget: 'datum',
                }}
            />
        </div>
    );
};

Networth.propTypes = {
    balances: PropTypes.arrayOf(PropTypes.shape()).isRequired,
};

export default Networth;
