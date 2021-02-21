import React from 'react';
import PropTypes from 'prop-types';

const PlanItem = ({
  plan,
  onSelect,
  selected,
}) => {
  const handleClick = () => {
    onSelect(plan);
  };

  let className = '';
  if (selected) {
    className += ' selected';
  }

  return (
    <div className={className} onClick={handleClick}>{plan.name}</div>
  );
};

PlanItem.propTypes = {
  plan: PropTypes.shape({
    name: PropTypes.string.isRequired,
  }).isRequired,
  onSelect: PropTypes.func.isRequired,
  selected: PropTypes.bool,
};

PlanItem.defaultProps = {
  selected: null,
};

export default PlanItem;
