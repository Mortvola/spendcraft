import React, { ReactElement, useEffect, useState } from 'react';
import Chart from 'react-google-charts';
import { getBody, httpGet } from '../state/Transports';

export const isNetworthReport = (r: unknown): r is number[][] => (
  true
)

const Networth = (): ReactElement | null => {
  const [data, setData] = useState<(number | string)[][] | null>(null);
  const [netIndex, setNetIndex] = useState<number>(0);

  useEffect(() => {
    (async () => {
      const response = await httpGet('/api/reports/networth');

      if (response.ok) {
        const body = await getBody(response);

        if (isNetworthReport(body)) {
          setNetIndex(body[0].length - 1);
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
                  [netIndex]: { type: 'line' },
                },
                focusTarget: 'datum',
              }}
            />
          )
          : null
      }
    </div>
  );

  return null;
};

export default Networth;
