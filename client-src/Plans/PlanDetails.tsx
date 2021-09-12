import React, { useState, useContext, ReactElement } from 'react';
import { observer } from 'mobx-react-lite';
import { DateTime } from 'luxon';
import PlanCategory from './PlanCategory';
import Amount from '../Amount';
import MobxStore from '../State/mobxStore';
import FundingPlanHistoryMonth from '../State/HistoryMonth';
import HistoryCategory from '../State/HistoryCategory';
import { CategoryInterface } from '../State/State';
import { isGroup } from '../State/Group';

const PlanDetails = (): ReactElement | null => {
  const { plans: { details }, categoryTree } = useContext(MobxStore);
  const [scroll, setScroll] = useState(0);
  const [now] = useState({ year: DateTime.now().year, month: DateTime.now().month - 1 });

  const handleOnDeltaChange = (category: CategoryInterface, amount: number, delta: number) => {
    if (delta !== 0) {
      if (details === null) {
        throw new Error('details is null');
      }

      details.updateCategoryAmount(category.id, amount, delta);
    }
  };

  const renderCategory = (category: CategoryInterface) => {
    if (details === null) {
      throw new Error('details is null');
    }

    const planCategory = details.categories.find((pc) => pc.categoryId === category.id);

    return (
      <PlanCategory
        key={`${category.groupId}:${category.id}`}
        category={category}
        amount={planCategory ? planCategory.amount : 0}
        onDeltaChange={handleOnDeltaChange}
      />
    )
  }

  const renderCategories = (categories: CategoryInterface[]) => (
    categories.map((c) => {
      if (details === null) {
        throw new Error('details is null');
      }

      return renderCategory(c);
    })
  );

  const renderNodes = () => (
    categoryTree.nodes.map((n) => {
      if (details === null) {
        throw new Error('details i null');
      }

      return (
        isGroup(n)
          ? (
            <div key={n.id} className="plan-group">
              {n.name}
              {renderCategories(n.categories)}
            </div>
          )
          : renderCategory(n)
      );
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
    category: CategoryInterface,
    categoryHistories: HistoryCategory[],
  ) => {
    const history = categoryHistories.find((h) => category.id === h.id);

    return (
      <div key={category.id} className="plan-history">
        {renderHistory(history ? history.months : [])}
      </div>
    )
  }

  const renderCategoryHistories = (
    cats: CategoryInterface[],
    categoryHistories: HistoryCategory[],
  ) => (
    cats.map((c) => renderCategoryHistory(c, categoryHistories))
  );

  const renderGroupHistory = () => (
    categoryTree.nodes.map((node) => {
      if (details === null) {
        throw new Error('details is null');
      }

      const history = details.history.find((h) => node.id === h.id);

      return (
        <div key={node.id}>
          <div style={{ height: '24px' }} />
          {
            isGroup(node)
              ? renderCategoryHistories(node.categories, history ? history.categories : [])
              : renderCategoryHistory(node, history ? history.categories : [])
          }
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

  return (
    <div className="plan window">
      {
        details
          ? (
            <>
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
                  {renderNodes()}
                </div>
                <div className="plan-wrapper">
                  <div style={{ position: 'relative', left: -scroll }}>
                    {renderGroupHistory()}
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
            </>
          )
          : null
      }
    </div>
  );
};

export default observer(PlanDetails);
