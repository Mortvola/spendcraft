import Http from '@mortvola/http';
import { DateTime, MonthNumbers } from 'luxon';
import React, { ReactElement, useEffect, useState } from 'react';
import { GroupType } from '../../common/ResponseTypes';
import Amount from '../Amount';
import styles from './FundingHistory.module.css';

const FundingHistory = (): ReactElement => {
  type FundingHistoryItem = { year: number, month: number, amount: number};
  type FundingHistoryResponse = {
    groupId: number,
    groupName: string,
    groupType: GroupType,
    categoryId: number,
    categoryName: string,
    history: FundingHistoryItem[] | null,
  }[];

  const [data, setData] = useState<FundingHistoryResponse | null>(null);
  const maxDisplayedMonths = 12;

  useEffect(() => {
    (async () => {
      const response = await Http.get<FundingHistoryResponse>('/api/reports/funding-history');

      if (response.ok) {
        const body = await response.body();
        body.sort((a, b) => {
          if (a.groupType === 'NO GROUP') {
            if (b.groupType === 'NO GROUP') {
              return a.categoryName.localeCompare(b.categoryName);
            }

            return a.categoryName.localeCompare(b.groupName);
          }

          if (b.groupType === 'NO GROUP') {
            return a.groupName.localeCompare(b.categoryName);
          }

          if (a.groupName === b.groupName) {
            return a.categoryName.localeCompare(b.categoryName);
          }

          return a.groupName.localeCompare(b.groupName);
        });

        setData(body);
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

      [month, year] = subtractMonth(month, year);
    }

    return elements;
  }

  const renderHistory = (history: FundingHistoryItem[] | null): React.ReactElement[] | null => {
    if (history) {
      let [year, month] = [DateTime.now().year, DateTime.now().month];
      const elements: React.ReactElement[] = [];

      for (let i = 0; i < maxDisplayedMonths; i += 1) {
        // eslint-disable-next-line no-loop-func
        const entry = history.find((h) => h.year === year && h.month === month)

        const [prevMonth, prevYear] = subtractMonth(month, year);
        const prevEntry = history.find((h) => h.year === prevYear && h.month === prevMonth);

        if (entry) {
          let className = styles.historyItem;
          if (i !== maxDisplayedMonths - 1 && (!prevEntry || (prevEntry && prevEntry.amount !== entry.amount))) {
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

        [month, year] = subtractMonth(month, year);
      }

      return elements;
    }

    return null;
  }

  return (
    <div className="window window1">
      <div className={`${styles.row} title`}>
        <div className={`${styles.category} ellipsis`}>Category</div>
        {
          renderHistoryTitles()
        }
      </div>
      <div className={styles.report}>
        {
          data
            ? data.map((d) => {
              const name = d.groupType === 'NO GROUP' ? d.categoryName : `${d.groupName}:${d.categoryName}`;

              return (
                <div className={styles.row} key={d.categoryId}>
                  <div className={`${styles.category} ellipsis`}>{name}</div>
                  {
                    renderHistory(d.history)
                  }
                </div>
              );
            })
            : null
        }
      </div>
    </div>
  );
}

export default FundingHistory;
