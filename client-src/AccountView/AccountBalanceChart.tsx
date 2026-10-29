import React, { useState } from 'react';
import { formatMoneyCents, parseMoneyCents, subtractMoneyCents, type MoneyCents } from '../../common/moneyCents';
import { observer } from 'mobx-react-lite';
import Chart from 'react-google-charts';
import { useStores } from '../State/Store';
import styles from './AccountBalanceChart.module.scss';
import Balance from './Balance';
import { StatementInterface } from '../State/Types';
import { DateTime } from 'luxon';
import { AccountType, TrackingType } from '../../common/ResponseTypes';
import { useStatementDialog } from './StatementDialog';

const AccountBalanceChart: React.FC = observer(() => {
  const { accountBalanceSeries, uiState: { selectedAccount } } = useStores();
  const [StatementDialog, showStatementDialog] = useStatementDialog();
  const [editedStatement, setEditedStatement] = useState<StatementInterface | null>(null);

  React.useEffect(() => {
    if (selectedAccount) { //&& selectedAccount.tracking === TrackingType.Balances) {
      if (selectedAccount.tracking === TrackingType.Balances || selectedAccount.type === AccountType.Investment) {
        selectedAccount?.statements.load()
      } else {
        accountBalanceSeries.load(selectedAccount);
      }
    }
  }, [accountBalanceSeries, selectedAccount]);

  const chartBalance = (balance: MoneyCents) => {
    const formatted = formatMoneyCents(balance);
    return { v: Number(formatted), f: formatted.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,') };
  };
  const signedBalance = (balance: MoneyCents) => selectedAccount?.sign === -1
    ? subtractMoneyCents(parseMoneyCents('0.00'), balance) : balance;

  let data: [string | null, string | { v: number; f: string }][] = [];

  if (selectedAccount?.tracking === TrackingType.Balances || selectedAccount?.type === AccountType.Investment) {
    const t: { balanceCents: MoneyCents, date: DateTime }[] = []
    const statements = selectedAccount?.statements.statements

    if (statements.length > 0) {
      t.push({
        balanceCents: statements[0].endingBalanceCents,
        date: statements[0].endDate,
      })

      let d = t[0].date.minus({ days: 1 })
      for (const b2 of statements) {
        const d2 = b2.endDate;
        const balance = b2.endingBalanceCents;

        while (d.toSeconds() > d2.toSeconds()) {
          t.push({
            balanceCents: balance, date: d,
          })
          d = d.minus({ day : 1 })
        }

        t.push({ balanceCents: balance, date: d2 })
        d = d2.minus({ days: 1})
      }

      t.push({
        balanceCents: statements[statements.length - 1].startingBalanceCents,
        date: statements[statements.length - 1].startDate,
      })

      data = t.reverse()
        .map((b) => [b.date.toISODate(), chartBalance(b.balanceCents)]);
    }
  } else {
    const t: { balanceCents: MoneyCents, date: DateTime }[] = []
    const b = accountBalanceSeries.points

    if (b.length > 0) {
      t.push({
        balanceCents: signedBalance(b[0].balanceCents),
        date: b[0].date,
      })

      let d = t[0].date.minus({ days: 1 })
      for (let i = 1; i < b.length; i += 1) {
        const b2 = b[i]
        const d2 = b2.date;
        const balance = signedBalance(b2.balanceCents);

        while (d.toSeconds() > d2.toSeconds()) {
          t.push({
            balanceCents: balance, date: d,
          })
          d = d.minus({ day : 1 })
        }

        t.push({ balanceCents: balance, date: d2 })
        d = d2.minus({ days: 1})
      }

      data = t.reverse()
        .map((b) => [b.date.toISODate(), chartBalance(b.balanceCents)]);
    }
  }

  data.splice(0, 0, ['date', 'balance']);

  const showStmtDialog = (statement: StatementInterface) => {
    setEditedStatement(statement);
    showStatementDialog();
  }

  const handleHideDialog = () => {
    setEditedStatement(null);
  }

  const renderStatemenents = () => (
    <>
      <div className="window">
        <div className={styles.list}>
          {
            selectedAccount?.statements.statements.map((s) => (
              <Balance key={s.id} id={s.id} balance={s.endingBalanceCents} date={s.endDate} onClick={() => showStmtDialog(s)} />
            ))
          }
        </div>
      </div>
      {
        selectedAccount && editedStatement
          ? (
            <StatementDialog statement={editedStatement} account={selectedAccount} onHide={handleHideDialog} />
          )
          : null
      }
    </>
  )

  return (
    <div className={`${styles.main} ${selectedAccount?.tracking === TrackingType.Balances ? styles.history : ''} window1`}>
      <div className="chart-wrapper window ">
        <Chart
          chartType="LineChart"
          data={data}
          options={{
            width: ('100%' as unknown) as number,
            height: ('100%' as unknown) as number,
            legend: { position: 'none' },
            hAxis: {
              slantedText: true,
            },
          }}
        />
      </div>
      {
        selectedAccount?.tracking === TrackingType.Balances || selectedAccount?.type === AccountType.Investment
          ? renderStatemenents()
          : null
      }
    </div>
  );
});

export default AccountBalanceChart;
