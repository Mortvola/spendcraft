import React, { useState } from 'react';
import PropTypes from 'prop-types';
import FundingItem from './FundingItem';

const Funding = ({ groups, plan, onDeltaChange }) => {
    const [funding, setFunding] = useState(plan ? plan.categories : []);

    const handleDeltaChange = (amount, delta, categoryId) => {
        const fundingCopy = funding.slice();
        const index = fundingCopy.findIndex((c) => c.categoryId === categoryId);

        if (index !== -1) {
            fundingCopy[index].amount = amount;
            setFunding(fundingCopy);
        }

        if (onDeltaChange) {
            onDeltaChange(amount, delta, fundingCopy);
        }
    };

    const populateCategories = (categories) => {
        const categoryItems = [];

        categories.forEach((category) => {
            let amount = 0;
            let planId = -1;

            if (plan) {
                planId = plan.planId;
                const index = plan.categories.findIndex((c) => c.categoryId === category.id);

                if (index !== -1) {
                    amount = plan.categories[index].amount;
                }
            }

            categoryItems.push((
                <FundingItem
                    key={`${planId}:${category.id}`}
                    name={category.name}
                    initialAmount={category.amount}
                    funding={amount}
                    onDeltaChange={(newAmount, delta) => (
                        handleDeltaChange(newAmount, delta, category.id)
                    )}
                />
            ));
        });

        return categoryItems;
    };

    const populateGroups = () => {
        const groupItems = [];

        groups.forEach((group) => {
            groupItems.push((
                <div key={group.id}>
                    {group.name}
                    {populateCategories(group.categories)}
                </div>
            ));
        });

        return groupItems;
    };

    return (
        <div className="cat-fund-items">
            {populateGroups()}
        </div>
    );
};

Funding.propTypes = {
    groups: PropTypes.arrayOf(PropTypes.shape()).isRequired,
    plan: PropTypes.shape(),
    onDeltaChange: PropTypes.func,
};

Funding.defaultProps = {
    plan: null,
    onDeltaChange: null,
};

export default Funding;
