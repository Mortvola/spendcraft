import Http from '@mortvola/http';
import React, { ReactElement, useEffect, useState } from 'react';
import Amount from '../Amount';
import styles from './FundingHistory.module.css';

const FundingHistory = (): ReactElement => {
  type FundingHistoryItem = { year: number, month: number, amount: number};
  type FundingHistoryResponse = {
    groupId: number,
    groupName: string,
    categoryId: number,
    categoryName: string,
    history: FundingHistoryItem[] | null,
  }[];

  const [data, setData] = useState<FundingHistoryResponse | null>(null);

  useEffect(() => {
    (async () => {
      const response = await Http.get<FundingHistoryResponse>('/api/reports/funding-history');

      if (response.ok) {
        const body = await response.body();
        setData(body);
      }
    })();
  }, []);

  const renderHistoryTitles = () => {
    let year = 2021;
    let month = 11;
    const elements: React.ReactElement[] = [];

    for (let i = 0; i < 12; i += 1) {
      elements.push(
        <div key={i} className={`${styles.historyItem} dollar-amount`}>
          {`${year}-${month}`}
        </div>,
      );

      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
    }

    return elements;
  }

  const renderHistory = (history: FundingHistoryItem[] | null): React.ReactElement[] | null => {
    if (history) {
      let year = 2021;
      let month = 11;
      const elements: React.ReactElement[] = [];

      for (let i = 0; i < 12; i += 1) {
        // eslint-disable-next-line no-loop-func
        const entry = history.find((h) => h.year === year && h.month === month)
        if (entry) {
          elements.push(<Amount key={i} className={styles.historyItem} amount={entry.amount} />)
        }
        else {
          elements.push(<div key={i} className={styles.historyItem} />)
        }

        month -= 1;
        if (month < 1) {
          month = 12;
          year -= 1;
        }
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
            ? data.map((d) => (
              <div className={styles.row} key={d.categoryId}>
                <div className={`${styles.category} ellipsis`}>{`${d.groupName}:${d.categoryName}`}</div>
                {
                  renderHistory(d.history)
                }
              </div>
            ))
            : null
        }
      </div>
    </div>
  );
}

export default FundingHistory;
