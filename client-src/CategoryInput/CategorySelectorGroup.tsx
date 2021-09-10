import React, { ReactElement } from 'react';
import CategorySelectorCategory from './CategorySelectorCategory';
import { CategoryInterface, GroupInterface } from '../state/State';

type PropsType = {
  group: GroupInterface,
  selected: string | null,
  onSelect: (category: CategoryInterface) => void,
}

function CategorySelectorGroup({
  group,
  selected,
  onSelect,
}: PropsType): ReactElement | null {
  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  if (group.categories.length > 0) {
    return (
      <div
        className="cat-list-item"
        onClick={handleClick}
      >
        {group.name}
        {group.categories.map((c) => (
          <CategorySelectorCategory
            key={c.id}
            category={c}
            selected={c.name === selected}
            onSelect={onSelect}
          />
        ))}
      </div>
    );
  }

  return null;
}

export default CategorySelectorGroup;
