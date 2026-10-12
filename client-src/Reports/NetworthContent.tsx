import React from 'react';
import Chart from 'react-google-charts';

const NetworthContent: React.FC<{ data: (number | string)[][] | null }> = ({ data }) => (
    <div className="chart-wrapper window window1">
      {
        data !== null && data.length <= 1
          ? <p>No net worth data available.</p>
          : data !== null
          ? (
            <Chart
              chartType="ComboChart"
              data={data}
              options={{
                width: ('100%' as unknown) as number,
                height: ('100%' as unknown) as number,
                legend: { position: 'none' },
                isStacked: true,
                hAxis: {
                  slantedText: true,
                },
                seriesType: 'bars',
                series: {
                  [data[0].length - 2]: { type: 'line' },
                },
                focusTarget: 'datum',
              }}
            />
          )
          : null
      }
    </div>
  );

export default NetworthContent;
