import React, { ReactNode } from 'react';
import { GroupInterface } from '../State/Types';

type PropsType = {
  group: GroupInterface,
  children?: ReactNode,
}

const CategorySelectorGroup: React.FC<PropsType> = ({
  group,
  children,
}) => {
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
