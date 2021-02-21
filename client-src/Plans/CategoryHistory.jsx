import React from 'react';
import PropTypes from 'prop-types';
import Amount from '../Amount';

const CategoryHistory = ({
  history,
}) => {
  const renderHistory = () => {
    const list = [];

    history.forEach((h) => {
      list.push((
        <Amount amount={h.amount} />
      ));
    });

    for (let i = list.length; i < 12; i += 1) {
      list.push((<div />));
    }

    return list;
  };

  return (
    <div className="plan-history">
      {renderHistory()}
    </div>
  );
};

CategoryHistory.propTypes = {
  history: PropTypes.arrayOf(PropTypes.shape({
    year: PropTypes.number.isRequired,
    month: PropTypes.number.isRequired,
    amount: PropTypes.number.isRequired,
  })).isRequired,
};

CategoryHistory.defaultProps = {
};

export default CategoryHistory;
