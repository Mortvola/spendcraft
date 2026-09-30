import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import Chart from 'react-google-charts';
import { useStores } from '../State/Store';
import styles from './BalanceHistory.module.scss';
import Balance from './Balance';
import { useBalanceDialog } from './BalanceDialog';
import { BalanceInterface, StatementInterface } from '../State/Types';
import { DateTime } from 'luxon';
import { AccountType, TrackingType } from '../../common/ResponseTypes';
import { useStatementDialog } from './StatementDialog';

const BalanceHistory: React.FC = observer(() => {
  const { balances, uiState: { selectedAccount } } = useStores();
  const [BalanceDialog, showBalanceDialog] = useBalanceDialog();
  const [StatementDialog, showStatementDialog] = useStatementDialog();
  const [editedBalance, setEditedBalance] = useState<BalanceInterface | null>(null);
  const [editedStatement, setEditedStatement] = useState<StatementInterface | null>(null);

  React.useEffect(() => {
    if (selectedAccount) { //&& selectedAccount.tracking === TrackingType.Balances) {
      if (selectedAccount.type === AccountType.Investment) {
        selectedAccount?.statements.load()
      } else {
        balances.load(selectedAccount);
      }
    }
  }, [balances, selectedAccount]);

  let data: [string | null, string | number][] = [];

  if (selectedAccount?.type === AccountType.Investment) {
    const t: { balance: number, date: DateTime }[] = []
    const statements = selectedAccount?.statements.statements

    if (statements.length > 0) {
      t.push({
        balance: statements[0].endingBalance,
        date: statements[0].endDate,
      })

      let d = t[0].date.minus({ days: 1 })
      for (const b2 of statements) {
        const d2 = b2.endDate;
        const balance = b2.endingBalance;

        while (d.toSeconds() > d2.toSeconds()) {
          t.push({
            balance: balance, date: d,
          })
          d = d.minus({ day : 1 })
        }

        t.push({ balance: balance, date: d2 })
        d = d2.minus({ days: 1})
      }

      t.push({
        balance: statements[statements.length - 1].startingBalance,
        date: statements[statements.length - 1].startDate,
      })

      data = t.reverse()
        .map((b) => [b.date.toISODate(), b.balance]);
    }
  } else {
    const t: { balance: number, date: DateTime }[] = []
    const b = balances.balances

    if (b.length > 0) {
      t.push({
        balance: b[0].balance * (selectedAccount?.sign ?? 1),
        date: b[0].date,
      })

      let d = t[0].date.minus({ days: 1 })
      for (let i = 1; i < b.length; i += 1) {
        const b2 = b[i]
        const d2 = b2.date;
        const balance = b2.balance * (selectedAccount?.sign ?? 1);

        while (d.toSeconds() > d2.toSeconds()) {
          t.push({
            balance: balance, date: d,
          })
          d = d.minus({ day : 1 })
        }

        t.push({ balance: balance, date: d2 })
        d = d2.minus({ days: 1})
      }

      data = t.reverse()
        .map((b) => [b.date.toISODate(), b.balance]);
    }
  }

  data.splice(0, 0, ['date', 'balance']);

  const showDialog = (balance: BalanceInterface) => {
    setEditedBalance(balance);
    showBalanceDialog();
  }

  const showStmtDialog = (statement: StatementInterface) => {
    setEditedStatement(statement);
    showStatementDialog();
  }

  const handleHideDialog = () => {
    setEditedBalance(null);
  }

  const renderStatemenents = () => (
    <>
      <div className="window">
        <div className={styles.list}>
          {
            selectedAccount?.statements.statements.map((s) => (
              <Balance key={s.id} id={s.id} balance={s.endingBalance} date={s.endDate} onClick={() => showStmtDialog(s)} />
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

  const renderBalances = () => (
    selectedAccount?.tracking === TrackingType.Balances
      ? (
        <>
          <div className="window">
            <div className={styles.list}>
              {balances.balances.map((b) => (
                <Balance key={b.id} id={b.id} balance={b.balance} date={b.date} onClick={() => showDialog(b)} />
              ))}
            </div>
          </div>
          <BalanceDialog balance={editedBalance} onHide={handleHideDialog} />
        </>
      )
      : null
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
        selectedAccount?.type === AccountType.Investment
          ? renderStatemenents()
          : renderBalances()
      }
    </div>
  );
});

export default BalanceHistory;
