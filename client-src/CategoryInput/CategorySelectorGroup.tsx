import React, { ReactNode } from 'react';
import { GroupInterface } from '../State/Types';

type PropsType = {
  group: GroupInterface,
  children?: ReactNode,
  level?: number,
}

const CategorySelectorGroup: React.FC<PropsType> = ({
  group,
  children,
  level = 0,
}) => {
  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  if (group.children.length > 0) {
    return (
      <>
        <div
          className="cat-list-item"
          onClick={handleClick}
          style={{ marginLeft: 24 * level }}
        >
          {group.name}
        </div>
        {children}
      </>
    );
  }

  return null;
}

export default CategorySelectorGroup;
