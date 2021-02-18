import React, { useState, useContext } from 'react';
import { observer } from 'mobx-react-lite';
import moment from 'moment';
import PlanCategory from './PlanCategory';
import Amount from '../Amount';
import MobxStore from '../state/mobxStore';

const PlanDetails = () => {
  const { plans: { details } } = useContext(MobxStore);
  const [scroll, setScroll] = useState(0);
  const [now] = useState({ year: moment().year(), month: moment().month() });

  const handleOnDeltaChange = (category, amount, delta) => {
    if (delta !== 0) {
      details.updateCategoryAmount(category.categoryId, amount, delta);
    }
  };

  const renderCategories = (cats, groupHistory) => {
    const list = [];

    cats.forEach((c) => {
      const history = groupHistory.find((h) => c.categoryId === h.id);

      list.push((
        <PlanCategory
          key={`${details.planId}-${c.categoryId}`}
          category={c}
          onDeltaChange={handleOnDeltaChange}
          history={history ? history.months : []}
        />
      ));
    });

    return list;
  };

  const renderGroups = (groups) => (
    groups.map((g) => {
      const history = details.history.find((h) => g.id === h.id);

      return ((
        <div key={g.id}>
          <div style={{ height: '24px' }}>{g.name}</div>
          {renderCategories(g.categories, history ? history.categories : [])}
        </div>
      ));
    })
  );

  const renderHistory = (history) => {
    const list = [];
    let { year, month } = now;

    history.slice().sort((a, b) => {
      if (a.year === b.year) {
        return b.month - a.month;
      }

      return b.year - a.year;
    });

    for (let i = 0, h = 0; i < 13; i += 1) {
      if (h < history.length
        && year === history[h].year
        && month === history[h].month - 1) {
        list.push(<Amount key={`${year}:${month}`} amount={history[h].amount} />);
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

  const renderCategoryHistory = (cats, groupHistory) => {
    const list = [];

    cats.forEach((c) => {
      const history = groupHistory.find((h) => c.categoryId === h.id);

      list.push((
        <div key={c.categoryId} className="plan-history">
          {renderHistory(history ? history.months : [])}
        </div>
      ));
    });

    return list;
  };

  const renderGroupHistory = (groups) => {
    const list = [];

    groups.forEach((g) => {
      const history = details.history.find((h) => g.id === h.id);

      list.push((
        <div key={g.id}>
          <div style={{ height: '24px' }} />
          {renderCategoryHistory(g.categories, history ? history.categories : [])}
        </div>
      ));
    });

    return list;
  };

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

  const handleScroll = (event) => {
    setScroll(event.target.scrollLeft);
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
