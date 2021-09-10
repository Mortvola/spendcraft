import React, { ReactElement, ReactNode } from 'react';
import { GroupInterface } from '../state/State';

type PropsType = {
  group: GroupInterface,
  children?: ReactNode,
}

function CategorySelectorGroup({
  group,
  children,
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
        {children}
      </div>
    );
  }

  return null;
}

export default CategorySelectorGroup;
