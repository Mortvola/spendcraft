import React, { useState } from 'react';
import PropTypes from 'prop-types';
import CategoryRebalanceItem from './CategoryRebalanceItem';

const CategoryRebalance = ({
  categoryTree,
  categories,
  onDeltaChange,
}) => {
  const [cats, setCats] = useState(categories);

  const handleDeltaChange = (amount, delta, categoryId) => {
    const categoriesCopy = cats.slice();
    const index = cats.findIndex((c) => c.categoryId === categoryId);

    if (index === -1) {
      if (amount !== 0) {
        categoriesCopy.splice(-1, 0, { categoryId, amount });
        setCats(categoriesCopy);
      }
    }
    else if (amount === 0) {
      // Remove category
      categoriesCopy.splice(index, 1);
      setCats(categoriesCopy);
    }
    else {
      categoriesCopy[index].amount = amount;
      setCats(categoriesCopy);
    }

    if (onDeltaChange) {
      onDeltaChange(amount, delta, categoriesCopy);
    }
  };

  const populateCategories = (group) => {
    const catItems = [];

    if (group) {
      group.forEach((category) => {
        let adjustment = 0;
        const catAmount = cats.find((c) => c.categoryId === category.id);
        if (catAmount) {
          adjustment = catAmount.amount;
        }

        catItems.push((
          <CategoryRebalanceItem
            key={category.id}
            category={{ name: category.name, balance: category.balance, adjustment }}
            onDeltaChange={(amount, delta) => (
              handleDeltaChange(amount, delta, category.id)
            )}
          />
        ));
      });
    }

    return catItems;
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
  categories: PropTypes.arrayOf(PropTypes.shape),
};

CategoryRebalance.defaultProps = {
  categoryTree: null,
  onDeltaChange: null,
  categories: [],
};

export default CategoryRebalance;
