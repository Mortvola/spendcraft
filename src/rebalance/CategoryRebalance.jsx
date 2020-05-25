import React, { useState } from 'react';
import PropTypes from 'prop-types';
import CategoryRebalanceItem from './CategoryRebalanceItem';

const CategoryRebalance = ({ categoryTree, onDeltaChange }) => {
    const [categories, setCategories] = useState([]);

    const handleDeltaChange = (amount, delta, categoryId) => {
        const categoriesCopy = categories.slice();
        const index = categories.findIndex((c) => c.categoryId === categoryId);

        if (index === -1) {
            if (amount !== 0) {
                categoriesCopy.splice(-1, 0, { categoryId, amount });
                setCategories(categoriesCopy);
            }
        }
        else if (amount === 0) {
            // Remove category
            categoriesCopy.splice(index, 1);
            setCategories(categoriesCopy);
        }
        else {
            categoriesCopy[index].amount = amount;
            setCategories(categoriesCopy);
        }

        if (onDeltaChange) {
            onDeltaChange(amount, delta, categoriesCopy);
        }
    };

    const populateCategories = (group) => {
        const cats = [];

        if (group) {
            group.forEach((category) => {
                cats.push((
                    <CategoryRebalanceItem
                        key={category.id}
                        category={category}
                        onDeltaChange={(amount, delta) => (
                            handleDeltaChange(amount, delta, category.id)
                        )}
                    />
                ));
            });
        }

        return cats;
    };

    const populateTree = (tree) => {
        const groups = [];

        if (tree) {
            tree.forEach((group) => {
                groups.push((
                    <div key={group.id}>
                        {group.name}
                        {populateCategories(group.categories)}
                    </div>
                ));
            });
        }

        return groups;
    };

    return (
        <div className="cat-rebalance-container">
            {populateTree(categoryTree)}
        </div>
    );
};

CategoryRebalance.propTypes = {
    categoryTree: PropTypes.arrayOf(PropTypes.shape),
    onDeltaChange: PropTypes.func,
};

CategoryRebalance.defaultProps = {
    categoryTree: null,
    onDeltaChange: null,
};

export default CategoryRebalance;
