import React, { ReactElement } from 'react';
import CategorySelectorCategory from './CategorySelectorCategory';
import Group from '../state/Group';
import Category from '../state/Category';
import LoansGroup from '../state/LoansGroup';

type PropsType = {
  group: Group | LoansGroup,
  selected: string | null,
  onSelected: (group: Group | LoansGroup, category: Category) => void,
}

function CategorySelectorGroup({
  group,
  selected,
  onSelected,
}: PropsType): ReactElement | null {
  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  const handleSelected = (category: Category) => {
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

export default CategorySelectorGroup;
