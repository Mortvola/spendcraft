import React, { useState } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import moment from 'moment';
import PlanCategory from './PlanCategory';
import Amount from '../Amount';

const PlanDetails = ({
    plan,
    dispatch,
}) => {
    const [total, setTotal] = useState(plan.total);
    const [scroll, setScroll] = useState(0);
    const [now] = useState({ year: moment().year(), month: moment().month() });

    const handleOnDeltaChange = (category, amount, delta) => {
        if (delta !== 0) {
            fetch(`/funding_plan/${plan.id}/item/${category.id}`, {
                method: 'PATCH',
                headers:
                {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ amount }),
            })
                .then(
                    () => setTotal(total + delta),
                    (error) => console.log('fetch error: ', error),
                );
        }
    };

    const renderCategories = (cats, groupHistory) => {
        const list = [];

        cats.forEach((c) => {
            const history = groupHistory.find((h) => c.categoryId === h.id);

            list.push((
                <PlanCategory
                    key={c.categoryId}
                    category={c}
                    onDeltaChange={handleOnDeltaChange}
                    history={history ? history.months : []}
                />
            ));
        });

        return list;
    };

    const renderGroups = (groups) => {
        const list = [];

        groups.forEach((g) => {
            const history = plan.history.find((h) => g.id === h.id);

            list.push((
                <div key={g.id}>
                    <div style={{ height: '24px' }}>{g.name}</div>
                    {renderCategories(g.categories, history ? history.categories : [])}
                </div>
            ));
        });

        return list;
    };

    const renderHistory = (history) => {
        const list = [];
        let { year, month } = now;

        history.sort((a, b) => {
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
            const history = plan.history.find((h) => g.id === h.id);

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
                    {renderGroups(plan.groups)}
                </div>
                <div className="plan-wrapper">
                    <div style={{ position: 'relative', left: -scroll }}>
                        {renderGroupHistory(plan.groups)}
                    </div>
                </div>
            </div>
            <div className="plan-total">
                Plan Total:
                <Amount amount={total} />
                <Amount amount={total * 12} />
                <div className="plan-history" onScroll={handleScroll}>
                    {renderMonthlyTotals()}
                </div>
            </div>
        </div>
    );
};

PlanDetails.propTypes = {
    plan: PropTypes.shape({
        id: PropTypes.number.isRequired,
        total: PropTypes.number.isRequired,
        groups: PropTypes.arrayOf(PropTypes.shape({
            name: PropTypes.string.isRequired,
            categories: PropTypes.arrayOf(PropTypes.shape()).isRequired,
        })),
        history: PropTypes.arrayOf(PropTypes.shape()).isRequired,
    }),
    dispatch: PropTypes.func.isRequired,
};

PlanDetails.defaultProps = {
    plan: {
        groups: [],
    },
};

export default connect()(PlanDetails);
