import React, { ReactElement, useEffect, useState } from 'react';
import Chart from 'react-google-charts';
import { getBody, httpGet } from '../state/Transports';

export const isNetworthReport = (r: unknown): r is (number | string)[][] => (
  true
)

const Networth = (): ReactElement | null => {
  const [data, setData] = useState<(number | string)[][] | null>(null);

  useEffect(() => {
    (async () => {
      const response = await httpGet('/api/reports/networth');

      if (response.ok) {
        const body = await getBody(response);

        if (isNetworthReport(body)) {
          // Append the networth data to the end of each row of the table.
          body.forEach((a, index) => {
            if (index === 0) {
              a.splice(a.length, 0, 'Net Worth');
            }
            else {
              a.splice(a.length, 0, a.reduce((accum, balance) => {
                if (typeof balance === 'string') {
                  return accum;
                }

                if (typeof accum === 'string') {
                  throw new Error('accumulator is a string');
                }

                return accum + balance;
              }, 0))
            }
          })
          setData(body);
        }
      }
    })();
  }, []);

  return (
    <div className="chart-wrapper window">
      {
        data !== null
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
};

export default Networth;
