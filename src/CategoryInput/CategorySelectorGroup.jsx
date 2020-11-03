import React from 'react';
import PropTypes from 'prop-types';
import CategorySelectorCategory from './CategorySelectorCategory';

function CategorySelectorGroup({
  group,
  selected,
  onSelected,
}) {
  const handleMouseDown = (event) => {
    event.preventDefault();
  };

  const handleClick = (event) => {
    event.stopPropagation();
  };

  const handleSelected = (category) => {
    onSelected(group, category);
  };

  if (group.categories.length > 0) {
    return (
      <div
        className="category-list-item"
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        {group.name}
        {group.categories.map((c) => (
          <CategorySelectorCategory
            key={c.id}
            category={c}
            selected={c.name === selected}
            onSelected={handleSelected}
          />
        ))}
      </div>
    );
  }

  return null;
}

CategorySelectorGroup.propTypes = {
  onSelected: PropTypes.func.isRequired,
  group: PropTypes.shape({
    name: PropTypes.string.isRequierd,
    categories: PropTypes.array.isRequired,
  }).isRequired,
  selected: PropTypes.string,
};

CategorySelectorGroup.defaultProps = {
  selected: null,
};

export default CategorySelectorGroup;
