import React from 'react';
import PropTypes from 'prop-types';

const PlanItem = ({
    plan,
    onSelect,
}) => {
    const handleClick = () => {
        onSelect(plan);
    };

    return (
        <div onClick={handleClick}>{plan.name}</div>
    );
};

PlanItem.propTypes = {
    plan: PropTypes.shape({
        name: PropTypes.string.isRequired,
    }).isRequired,
    onSelect: PropTypes.func.isRequired,
};

export default PlanItem;
