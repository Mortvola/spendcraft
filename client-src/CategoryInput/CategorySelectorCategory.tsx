import React, { useRef, useEffect } from 'react';
import { CategoryInterface } from '../State/Types';

interface PropsType {
  category: CategoryInterface,
  selected?: boolean,
  selectedCategory?: CategoryInterface,
  onSelect: (category: CategoryInterface) => void,
  level?: number,
}

const CategorySelectorCategory: React.FC<PropsType> = ({
  category,
  selected,
  selectedCategory,
  onSelect,
  level = 0,
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
    <>
      <div
        className={className}
        onClick={handleClick}
        ref={ref}
        style={{ marginLeft: level * 24 }}
      >
        {category.name}
      </div>
      {
        category.subcategories.map((subcat) => (
          <CategorySelectorCategory
            key={`${subcat.id}`}
            category={subcat}
            selected={selectedCategory !== null && subcat.id === selectedCategory?.id}
            onSelect={onSelect}
            level={level + 1}
          />
        ))
      }
    </>
  );
};

export default CategorySelectorCategory;
