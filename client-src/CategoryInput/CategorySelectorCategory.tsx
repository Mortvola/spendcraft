import React, { useRef, useEffect, ReactElement } from 'react';
import { CategoryInterface } from '../state/State';

type PropsType = {
  category: CategoryInterface,
  selected?: boolean,
  onSelect: (category: CategoryInterface) => void,
}
const CategorySelectorCategory = ({
  category,
  selected,
  onSelect,
}: PropsType): ReactElement => {
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
