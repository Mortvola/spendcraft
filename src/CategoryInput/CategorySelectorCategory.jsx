import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';

const CategorySelectorCategory = ({
  category,
  selected,
  onSelected,
}) => {
  const ref = useRef(null);

  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView(false);
    }
  }, [selected, ref]);

  const handleClick = (event) => {
    event.stopPropagation();
    onSelected(category);
  };

  let className = 'cat-list-cat category-list-item category-select-item';

  if (selected) {
    className += ' selected';
  }

  return (
    <div
      className={className}
      onClick={handleClick}
      ref={ref}
    >
      {category.name}
    </div>
  );
};

CategorySelectorCategory.propTypes = {
  onSelected: PropTypes.func.isRequired,
  selected: PropTypes.bool.isRequired,
  category: PropTypes.shape().isRequired,
};

export default CategorySelectorCategory;
