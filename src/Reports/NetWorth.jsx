import React from 'react';
import PropTypes from 'prop-types';
import Chart from 'react-google-charts';

const Networth = ({
  balances,
}) => {
  const netIndex = balances[0].length - 1;
  const data = balances.map((item, index) => {
    if (index === 0) {
      return item.concat(['Net Worth']);
    }

    return item.concat([item.reduce((accum, balance, index2) => {
      if (index2 === 0 || balance === null || Number.isNaN(balance)) {
        return accum;
      }

      return accum + balance;
    }, 0)]);
  });

  return (
    <div className="chart-wrapper">
      <Chart
        chartType="ComboChart"
        data={data}
        options={{
          width: '100%',
          height: '100%',
          legend: { position: 'none' },
          isStacked: true,
          hAxis: {
            slantedText: true,
          },
          seriesType: 'bars',
          series: {
            [netIndex]: { type: 'line' },
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
