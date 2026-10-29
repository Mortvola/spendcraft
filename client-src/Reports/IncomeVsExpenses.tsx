import { formatMoneyCents, type MoneyCents } from '../../common/moneyCents';
import { decodeIncomeVsExpensesReport, type IncomeVsExpensesCentsRow } from '../monetary';
import type { IncomeVsExpensesReportResponse } from '../../common/ResponseTypes';
import Http from '@mortvola/http';
import React, { useEffect, useState } from 'react';
import Chart from 'react-google-charts';

const IncomeVsExpenses: React.FC = () => {

  const [data, setData] = useState<IncomeVsExpensesCentsRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const response = await Http.get<IncomeVsExpensesReportResponse>('/api/v1/reports/income-vs-expenses');

      if (response.ok) {
        const body = await response.body();

        setData(decodeIncomeVsExpensesReport(body));
      }
    })();
  }, []);

  const chartAmount = (cents: MoneyCents) => {
    const formatted = formatMoneyCents(cents);
    return { v: Number(formatted), f: formatted.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,') };
  };

  return (
    <div className="chart-wrapper window window1">
      {
        data !== null
          ? (
            <Chart
              chartType="ComboChart"
              data={[['date', 'income', 'expenses', 'net'],
                ...data.map(([month, ...amounts]) => [month, ...amounts.map(chartAmount)]),
              ]}
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
                  2: { type: 'line' },
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
