import React, { useRef, useEffect } from 'react';
import { CategoryInterface } from '../State/Types';

type PropsType = {
  category: CategoryInterface,
  selected?: boolean,
  onSelect: (category: CategoryInterface) => void,
}

const CategorySelectorCategory: React.FC<PropsType> = ({
  category,
  selected,
  onSelect,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (selected && element) {
      element.scrollIntoView(false);
    }
  }, [selected, ref]);

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onSelect(category);
  };

  let className = 'cat-list-cat cat-list-item category-select-item';

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

export default CategorySelectorCategory;
