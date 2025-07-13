import Http from '@mortvola/http';
import { DateTime, MonthNumbers } from 'luxon';
import React, { useEffect, useState } from 'react';
import { GroupType } from '../../common/ResponseTypes';
import Amount from '../Amount';
import styles from './FundingHistory.module.scss';

const FundingHistory: React.FC = () => {
  interface FundingHistoryItem { year: number, month: number, amount: number}
  interface FundingHistoryCategory {
    groupId: number,
    groupName: string,
    groupType: GroupType,
    categoryId: number,
    categoryName: string,
    history: FundingHistoryItem[] | null,
  }
  type FundingHistoryResponse = FundingHistoryCategory[];

  const [data, setData] = useState<FundingHistoryCategory[] | null>(null);
  const [totals, setTotals] = useState<FundingHistoryItem[] | null>(null);
  const maxDisplayedMonths = 12;

  useEffect(() => {
    (async () => {
      const response = await Http.get<FundingHistoryResponse>('/api/v1/reports/funding-history');

      if (response.ok) {
        const body = await response.body();
        body.sort((a, b) => {
          if (a.groupType === GroupType.NoGroup) {
            if (b.groupType === GroupType.NoGroup) {
              return a.categoryName.localeCompare(b.categoryName);
            }

            return a.categoryName.localeCompare(b.groupName);
          }

          if (b.groupType === GroupType.NoGroup) {
            return a.groupName.localeCompare(b.categoryName);
          }

          if (a.groupName === b.groupName) {
            return a.categoryName.localeCompare(b.categoryName);
          }

          return a.groupName.localeCompare(b.groupName);
        });

        const newTotals: FundingHistoryItem[] = [];

        body.forEach((g) => {
          g.history?.forEach((h) => {
            const total = newTotals.find((t) => t.year === h.year && t.month === h.month);

            if (total) {
              total.amount += h.amount;
            }
            else {
              newTotals.push({ year: h.year, month: h.month, amount: h.amount });
            }
          })
        });

        setData(body);
        setTotals(newTotals);
      }
    })();
  }, []);

  const subtractMonth = (month: MonthNumbers, year: number): [MonthNumbers, number] => {
    if (month === 1) {
      return [12, year - 1];
    }

    return [(month - 1) as MonthNumbers, year];
  }

  const renderHistoryTitles = () => {
    let [year, month] = [DateTime.now().year, DateTime.now().month];

    const elements: React.ReactElement[] = [];

    for (let i = 0; i < maxDisplayedMonths; i += 1) {
      elements.push(
        <div key={i} className={`${styles.historyItem} dollar-amount`}>
          {`${year}-${month}`}
        </div>,
      );

      [month, year] = subtractMonth(month as MonthNumbers, year);
    }

    return elements;
  }

  const amountsMatch = (a: number, b: number) => (
    a.toFixed(2) === b.toFixed(2)
  );

  const renderHistory = (history: FundingHistoryItem[] | null): React.ReactElement[] | null => {
    if (history) {
      let [year, month] = [DateTime.now().year, DateTime.now().month];
      const elements: React.ReactElement[] = [];

      for (let i = 0; i < maxDisplayedMonths; i += 1) {
         
        const entry = history.find((h) => h.year === year && h.month === month)

        const [prevMonth, prevYear] = subtractMonth(month as MonthNumbers, year);
        const prevEntry = history.find((h) => h.year === prevYear && h.month === prevMonth);

        if (entry) {
          let className = styles.historyItem;
          if (i !== maxDisplayedMonths - 1
            && (!prevEntry || (prevEntry && !amountsMatch(prevEntry.amount, entry.amount)))
          ) {
            className += ` ${styles.change}`;
          }

          elements.push(<Amount key={i} className={className} amount={entry.amount} />)
        }
        else {
          let className = styles.historyItem;
          if (i !== maxDisplayedMonths - 1 && prevEntry) {
            className += ` ${styles.change}`;
          }

          elements.push(<div key={i} className={className} />)
        }

        [month, year] = subtractMonth(month as MonthNumbers, year);
      }

      return elements;
    }

    return null;
  }

  let currentGroup: null | string = null;

  const renderRow = (d: FundingHistoryCategory, indent: string) => (
    <div className={styles.row} key={d.categoryId}>
      <div className={`${styles.category} ${indent} ellipsis`}>{d.categoryName}</div>
      {
        renderHistory(d.history)
      }
    </div>
  );

  return (
    <div className={`window window1 ${styles.report}`}>
      <div className={`${styles.row} title`}>
        <div className={`${styles.category} ellipsis`}>Category</div>
        {
          renderHistoryTitles()
        }
      </div>
      <div className={styles.reportItems}>
        {
          data
            ? data.map((d) => {
              if (d.groupType === GroupType.NoGroup) {
                currentGroup = d.groupName;

                return renderRow(d, styles.indent1);
              }

              if (d.groupName !== currentGroup) {
                currentGroup = d.groupName;

                return (
                  <>
                    <div className={styles.indent1}>{d.groupName}</div>
                    {
                      renderRow(d, styles.indent2)
                    }
                  </>
                )
              }

              return renderRow(d, styles.indent2);
            })
            : null
        }
        <div className={`${styles.row} ${styles.totals}`} key="total">
          <div className={`${styles.category} ${styles.indent1} ellipsis`}>Totals</div>
          {
            renderHistory(totals)
          }
        </div>
      </div>
    </div>
  );
}

export default FundingHistory;
