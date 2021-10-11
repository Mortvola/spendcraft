import Http from '@mortvola/http';
import React, { ReactElement, useEffect, useState } from 'react';
import Chart from 'react-google-charts';

export const isIncomeVsExpensesReport = (r: unknown): r is (number | string)[][] => (
  true
)

const IncomeVsExpenses = (): ReactElement => {
  const [data, setData] = useState<(number | string)[][] | null>(null);

  useEffect(() => {
    (async () => {
      const response = await Http.get('/api/reports/income-vs-expenses');

      if (response.ok) {
        const body = await response.body();

        if (isIncomeVsExpensesReport(body)) {
          // Append the income/expense data to the end of each row of the table.
          body.splice(0, 0, ['date', 'income', 'expenses', 'net']);
          setData(body);
        }
      }
    })();
  }, []);

  return (
    <div className="chart-wrapper window window1">
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
}

export default IncomeVsExpenses;
