import Http from '@mortvola/http';
import { Formik } from 'formik';
import { DateTime } from 'luxon';
import { observer } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import Chart, { GoogleChartWrapper } from 'react-google-charts';
import { BudgetProgressReportResponse } from '../../common/ResponseTypes';
import PleaseWait from '../PleaseWait';
import { useStores } from '../State/mobxStore';
import TransactionContainer from '../State/TransactionContainer';
import RegisterTransactions from '../Transactions/RegisterTransactions';
import Transaction from '../Transactions/Transactions/Transaction';
import TransactionBase from '../Transactions/Transactions/TransactionBase';
import MonthSelector from './MonthSelector';
import ReportControls from './ReportControls';

const BudgetProgress: React.FC = observer(() => {
  const store = useStores();
  const [data, setData] = useState<(number | string)[][] | null>(null);
  const [days, setDays] = useState<[number, number[]][]>([]);
  const [value, setValue] = React.useState<string>(() => {
    const n = DateTime.now();
    return `${n.month}-${n.year}`;
  });
  const [transactions, setTransactions] = React.useState<TransactionContainer | null>(null);
  const [querying, setQuerying] = React.useState<boolean>(false);

  useEffect(() => {
    setQuerying(true);
    (async () => {
      try {
        const response = await Http.get<BudgetProgressReportResponse>(`/api/v1/reports/budget-progress?m=${value}`);

        if (response.ok) {
          const body = await response.body();

          const date = DateTime.fromFormat(value, 'M-yyyy');

          if (date === null || date === undefined) {
            throw new Error('date is null')
          }

          const { daysInMonth } = date;

          if (daysInMonth === undefined) {
            throw new Error('daysInMonth is undefined')
          }

          const newDays = new Array<[number, number[]]>(daysInMonth);

          body.forEach((m) => {
            newDays[DateTime.fromISO(m[0]).day - 1] = [m[1], m[2]];
          });

          for (let d = 0; d < newDays.length; d += 1) {
            if (newDays[d] === undefined) {
              if (d > 0) {
                newDays[d] = newDays[d - 1];
              }
              else {
                newDays[d] = [0, []];
              }
            }
          }

          setDays(newDays);

          setData([
            ['date', 'amount'],
            ...newDays.map((d, index) => ([
              index + 1,
              d[0],
            ])),
          ]);
        }
      }
      catch (error) {
        console.log(error);
      }

      setQuerying(false);
    })();
  }, [value]);

  const handleChangeEvent: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    setValue(event.target.value);
  }

  const fetchTransactions = React.useCallback(async (transactionIds: number[]) => {
    const queryParams = transactionIds.reduce((accum, t, index) => {
      if (index === 0) {
        return `t=${t}`;
      }

      return `${accum}&t=${t}`;
    }, '');

    const container = new TransactionContainer(store, `/api/v1/transactions?${queryParams}`);
    container.getTransactions();
    setTransactions(container);
    // const response = await Http.get<TransactionProps>(`/api/v1/transactions?${queryParams}`);

    // if (response.ok) {
    //   const body = await response.body();
    // }
  }, [store]);

  const selectCallback = React.useCallback(({ chartWrapper }: { chartWrapper: GoogleChartWrapper}) => {
    const selection = chartWrapper.getChart().getSelection();
    if (selection.length > 0) {
      const transactionIds = days[selection[0].row][1];
      fetchTransactions(transactionIds);
    }
  }, [days, fetchTransactions]);

  return (
    <div className="chart-wrapper window window1">
      <Formik initialValues={{}} onSubmit={() => console.log('submit')}>
        <ReportControls>
          <MonthSelector value={value} onChange={handleChangeEvent} />
        </ReportControls>
      </Formik>
      {
        querying
          ? <PleaseWait />
          : (
            <>
              <div className="chart-wrapper">
                {
                  data !== null && data.length > 1
                    ? (
                      <Chart
                        chartType="ColumnChart"
                        data={data}
                        width="100%"
                        height="100%"
                        chartEvents={[{
                          eventName: 'select',
                          callback: selectCallback,
                        }]}
                        options={{
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
              {
                transactions
                  ? (
                    <RegisterTransactions trxContainer={transactions}>
                      {
                        transactions.transactions.map((t) => (
                          <TransactionBase key={t.id} transaction={t}>
                            <Transaction transaction={t} amount={t.amount} runningBalance={0} />
                          </TransactionBase>
                        ))
                      }
                    </RegisterTransactions>
                  )
                  : null
              }
            </>
          )
      }
    </div>
  );
});

export default BudgetProgress;
