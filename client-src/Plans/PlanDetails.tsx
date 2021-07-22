import React, { useState, useContext, ReactElement } from 'react';
import { observer } from 'mobx-react-lite';
import moment from 'moment';
import PlanCategory from './PlanCategory';
import Amount from '../Amount';
import MobxStore from '../state/mobxStore';
import FundingPlanGroup from '../state/FundingPlanGroup';
import FundingPlanCategory from '../state/FundingPlanCategory';
import FundingPlanHistoryMonth from '../state/HistoryMonth';
import HistoryGroup from '../state/HistoryGroup';
import HistoryCategory from '../state/HistoryCategory';

const PlanDetails = (): ReactElement | null => {
  const { plans: { details } } = useContext(MobxStore);
  const [scroll, setScroll] = useState(0);
  const [now] = useState({ year: moment().year(), month: moment().month() });

  const handleOnDeltaChange = (category: FundingPlanCategory, amount: number, delta: number) => {
    if (delta !== 0) {
      if (details === null) {
        throw new Error('details is null');
      }

      details.updateCategoryAmount(category.categoryId, amount, delta);
    }
  };

  const renderCategories = (
    cats: FundingPlanCategory[],
  ) => (
    cats.map((c) => {
      if (details === null) {
        throw new Error('details i null');
      }

      return (
        <PlanCategory
          key={`${details.id}-${c.categoryId}`}
          category={c}
          onDeltaChange={handleOnDeltaChange}
        />
      );
    })
  );

  const renderGroups = (
    groups: FundingPlanGroup[],
  ) => (
    groups.map((g) => {
      if (details === null) {
        throw new Error('details i null');
      }

      // const history = details.history.find((h) => g.id === h.id);

      return ((
        <div key={g.id}>
          <div style={{ height: '24px' }}>{g.name}</div>
          {renderCategories(g.categories)}
        </div>
      ));
    })
  );

  const renderHistory = (history: FundingPlanHistoryMonth[]) => {
    const list = [];
    let { year, month } = now;

    const sortedHistory = history.slice().sort((a, b) => {
      if (a.year === b.year) {
        return b.month - a.month;
      }

      return b.year - a.year;
    });

    for (let i = 0, h = 0; i < 13; i += 1) {
      if (h < sortedHistory.length
        && year === sortedHistory[h].year
        && month === sortedHistory[h].month - 1) {
        list.push(<Amount key={`${year}:${month}`} amount={sortedHistory[h].amount} />);
        h += 1;
      }
      else {
        list.push(<Amount key={`${year}:${month}`} noValue="-" />);
      }

      month -= 1;
      if (month < 0) {
        month = 11;
        year -= 1;
      }
    }

    return list;
  };

  const renderCategoryHistory = (
    cats: FundingPlanCategory[],
    groupHistory: HistoryCategory[],
  ) => (
    cats.map((c) => {
      const history = groupHistory.find((h) => c.categoryId === h.id);

      return (
        <div key={c.categoryId} className="plan-history">
          {renderHistory(history ? history.months : [])}
        </div>
      );
    })
  );

  const renderGroupHistory = (groups: FundingPlanGroup[]) => (
    groups.map((g) => {
      if (details === null) {
        throw new Error('details i null');
      }

      const history = details.history.find((h) => g.id === h.id);

      return (
        <div key={g.id}>
          <div style={{ height: '24px' }} />
          {renderCategoryHistory(g.categories, history ? history.categories : [])}
        </div>
      );
    })
  );

  const renderMonthlyTitles = () => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const months = [];
    let { year, month } = now;

    for (let i = 0; i < 13; i += 1) {
      const yearString = year.toString();
      months.push((
        <div key={i}>{`${monthNames[month]}-${yearString.substring(yearString.length - 2)}`}</div>
      ));

      month -= 1;
      if (month < 0) {
        month = 11;
        year -= 1;
      }
    }

    return months;
  };

  const renderMonthlyTotals = () => {
    const list = [];

    for (let i = 0; i < 13; i += 1) {
      list.push(<div key={i} />);
    }

    return list;
  };

  const handleScroll = (event: React.UIEvent<Element>) => {
    setScroll(event.currentTarget.scrollLeft);
  };

  if (details) {
    return (
      <div className="plan">
        <div className="plan-title-wrapper">
          <div className="plan-total title">
            <div>Category</div>
            <div className="currency">Monthly Amount</div>
            <div className="currency">Annual Amount</div>
            <div className="plan-wrapper">
              <div className="plan-history" style={{ position: 'relative', left: -scroll }}>
                {renderMonthlyTitles()}
              </div>
            </div>
          </div>
        </div>
        <div className="plan-detail-wrapper">
          <div className="plan-details">
            {renderGroups(details.groups)}
          </div>
          <div className="plan-wrapper">
            <div style={{ position: 'relative', left: -scroll }}>
              {renderGroupHistory(details.groups)}
            </div>
          </div>
        </div>
        <div className="plan-total">
          Plan Total:
          <Amount amount={details.total} />
          <Amount amount={details.total * 12} />
          <div className="plan-history" onScroll={handleScroll}>
            {renderMonthlyTotals()}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default observer(PlanDetails);
