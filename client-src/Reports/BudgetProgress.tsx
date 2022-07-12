import Http from '@mortvola/http';
import { Formik } from 'formik';
import { DateTime } from 'luxon';
import React, { useEffect, useState } from 'react';
import Chart from 'react-google-charts';
import { BudgetProgressReportResponse } from '../../common/ResponseTypes';
import MonthSelector from './MonthSelector';
import ReportControls from './ReportControls';

const BudgetProgress: React.FC = () => {
  const [data, setData] = useState<(number | string)[][] | null>(null);
  const [value, setValue] = React.useState<string>(() => {
    const n = DateTime.now();
    return `${n.month}-${n.year}`;
  });

  useEffect(() => {
    (async () => {
      const response = await Http.get<BudgetProgressReportResponse>(`/api/reports/budget-progress?m=${value}`);

      if (response.ok) {
        const body = await response.body();

        const date = DateTime.fromFormat(value, 'M-yyyy');
        const days = new Array(date.daysInMonth);

        body.forEach((m) => {
          [, days[DateTime.fromISO(m[0]).day - 1]] = m;
        });

        for (let d = 0; d < days.length; d += 1) {
          if (days[d] === undefined) {
            if (d > 0) {
              days[d] = days[d - 1];
            }
            else {
              days[d] = 0;
            }
          }
        }

        setData([
          ['date', 'amount'],
          ...days.map((d, index) => ([
            index + 1,
            d,
          ])),
        ]);
      }
    })();
  }, [value]);

  const handleChangeEvent: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    setValue(event.target.value);
  }

  return (
    <div className="chart-wrapper window window1">
      <Formik initialValues={{}} onSubmit={() => console.log('submit')}>
        <ReportControls>
          <MonthSelector value={value} onChange={handleChangeEvent} />
        </ReportControls>
      </Formik>
      <div className="chart-wrapper">
        {
          data !== null && data.length > 1
            ? (
              <Chart
                chartType="ColumnChart"
                data={data}
                options={{
                  width: ('100%' as unknown) as number,
                  height: ('100%' as unknown) as number,
                  legend: { position: 'none' },
                  isStacked: true,
                  focusTarget: 'datum',
                  hAxis: {
                    minValue: 1,
                  },
                }}
              />
            )
            : null
        }
      </div>
    </div>
  );
}

export default BudgetProgress;
