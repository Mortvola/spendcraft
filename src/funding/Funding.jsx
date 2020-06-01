import React, { useState } from 'react';
import PropTypes from 'prop-types';
import FundingItem from './FundingItem';

const Funding = ({ groups, plan, onChange }) => {
    const [funding, setFunding] = useState(plan);

    const handleDeltaChange = (amount, categoryId) => {
        const index = funding.findIndex((c) => c.categoryId === categoryId);

        if (index !== -1) {
            const fundingCopy = funding.slice();
            fundingCopy[index].amount = amount;
            setFunding(fundingCopy);

            if (onChange) {
                onChange(fundingCopy);
            }
        }
    };

    const populateCategories = (categories) => {
        const categoryItems = [];

        categories.forEach((category) => {
            let amount = 0;

            const index = funding.findIndex((c) => c.categoryId === category.id);

            if (index !== -1) {
                amount = funding[index].amount;
            }

            categoryItems.push((
                <FundingItem
                    key={`${category.id}`}
                    name={category.name}
                    initialAmount={category.amount}
                    funding={amount}
                    onDeltaChange={(newAmount) => (
                        handleDeltaChange(newAmount, category.id)
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
    onChange: PropTypes.func,
};

Funding.defaultProps = {
    plan: [],
    onChange: null,
};

export default Funding;
