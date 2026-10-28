import { decodeAmount } from '../monetary';
import type { IncomeVsExpensesReportResponse } from '../../common/ResponseTypes';
import Http from '@mortvola/http';
import React, { useEffect, useState } from 'react';
import Chart from 'react-google-charts';

const IncomeVsExpenses: React.FC = () => {

  const [data, setData] = useState<(number | string)[][] | null>(null);

  useEffect(() => {
    (async () => {
      const response = await Http.get<IncomeVsExpensesReportResponse>('/api/v1/reports/income-vs-expenses');

      if (response.ok) {
        const body = await response.body();

        // Append the income/expense data to the end of each row of the table.
        setData([['date', 'income', 'expenses', 'net'],
          ...body.map(([month, income, expenses, net]) => [month, decodeAmount(income), decodeAmount(expenses), decodeAmount(net)]),
        ]);
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
