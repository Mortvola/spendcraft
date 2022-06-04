import Http from '@mortvola/http';
import React, { useEffect, useState } from 'react';
import Chart from 'react-google-charts';

const IncomeVsExpenses: React.FC = () => {
  type IncomeVsExpensesResponse = [string, number | string, number | string, number | string][];

  const [data, setData] = useState<(number | string)[][] | null>(null);

  useEffect(() => {
    (async () => {
      const response = await Http.get<IncomeVsExpensesResponse>('/api/reports/income-vs-expenses');

      if (response.ok) {
        const body = await response.body();

        // Append the income/expense data to the end of each row of the table.
        body.splice(0, 0, ['date', 'income', 'expenses', 'net']);
        setData(body);
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
