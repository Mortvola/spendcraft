import React, {
  useState, useRef, useEffect, useContext, ReactElement,
} from 'react';
import ReactDOM from 'react-dom';
import CategorySelector from './CategorySelector';
import useExclusiveBool from '../ExclusiveBool';
import MobxStore from '../state/mobxStore';
import Group from '../state/Group';
import Category from '../state/Category';
import { CategoryInterface, GroupInterface } from '../state/State';
import LoansGroup from '../state/LoansGroup';

type PropsType = {
  categoryId: number | null,
  onChange: (category: CategoryInterface) => void,
}

const CategoryInput = ({
  categoryId = null,
  onChange,
}: PropsType): ReactElement => {
  const { categoryTree } = useContext(MobxStore);
  const { groups } = categoryTree;
  const [selected, setSelected] = useState<
    { groupIndex: number | null, categoryIndex: number | null }
  >(
    { groupIndex: null, categoryIndex: null },
  );
  const [open, setOpen] = useExclusiveBool(false);
  const [value, setValue] = useState<string | null>(
    categoryId === null || categoryTree.unassignedCat && categoryId === categoryTree.unassignedCat.id
      ? null
      : categoryTree.getCategoryName(categoryId),
  );
  const [originalValue, setOriginalValue] = useState<string | null>(
    categoryId === null || categoryTree.unassignedCat && categoryId === categoryTree.unassignedCat.id
      ? null
      : categoryTree.getCategoryName(categoryId),
  );
  const [filter, setFilter] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectorRef = useRef<HTMLDivElement | null>(null);

  const categoryFiltered = (
    group: GroupInterface,
    category: Category,
    filterParts: string[],
  ) => {
    if (filterParts.length > 0) {
      if (filterParts.length === 1) {
        // No colon. Filter can be applied to both group and categories.
        if (category.name.toLowerCase().includes(filterParts[0])) {
          return false;
        }

        return !group.name.toLowerCase().includes(filterParts[0]);
      }

      // If the group contains the first part of the filter then
      // consider adding the categories
      if (filterParts[1] === '' || category.name.toLowerCase().includes(filterParts[1])) {
        return false;
      }

      return !(filterParts[0] === '' || group.name.toLowerCase().includes(filterParts[0]));
    }

    return false;
  };

  const handleCancel = () => {
    setOpen(false);
    setValue(originalValue);
    setFilter(null);
  };

  const handleMouseDown = (event: MouseEvent) => {
    const input = inputRef.current;
    const selector = selectorRef.current;
    if (input && !input.contains(event.target as Node)
      && (selector === null || !selector.contains(event.target as Node))) {
      event.stopPropagation();
      handleCancel();
    }
  };

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleMouseDown, false);

      return () => {
        document.removeEventListener('mousedown', handleMouseDown);
      };
    }

    return undefined;
  });

  const openDropDown = () => {
    setOriginalValue(categoryId === null ? null : categoryTree.getCategoryName(categoryId));
    setOpen(true);
  };

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!open) {
      openDropDown();
    }
  };

  const handleSelect = (group: Group | LoansGroup, category: Category) => {
    const groupIndex = groups.findIndex((g) => g.id === group.id);
    const categoryIndex = groups[groupIndex].categories.findIndex((c) => c.id === category.id);

    setSelected({ groupIndex, categoryIndex });
    setOpen(false);
    setValue(categoryTree.getCategoryName(category.id));
    setOriginalValue(categoryId === null ? null : categoryTree.getCategoryName(categoryId));

    if (onChange) {
      onChange(category);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    setFilter(event.target.value);
  };

  const handleBlur = () => {
    setOpen(false);
  };

  const handleDown = () => {
    const newSelection = {
      groupIndex: selected.groupIndex,
      categoryIndex: selected.categoryIndex,
    };

    if (newSelection.groupIndex === null || newSelection.categoryIndex === null) {
      newSelection.groupIndex = 0;
      newSelection.categoryIndex = 0;
    }
    else {
      newSelection.categoryIndex += 1;

      if (newSelection.categoryIndex
        >= groups[newSelection.groupIndex].categories.length) {
        newSelection.groupIndex += 1;
        newSelection.categoryIndex = 0;
      }
    }

    const filterParts = filter ? filter.toLowerCase().split(':') : [];

    while (
      newSelection.groupIndex < groups.length
      && (groups[newSelection.groupIndex].categories.length === 0
      || categoryFiltered(
        groups[newSelection.groupIndex],
        groups[newSelection.groupIndex].categories[newSelection.categoryIndex],
        filterParts,
      ))
    ) {
      newSelection.categoryIndex += 1;

      if (newSelection.categoryIndex
        >= groups[newSelection.groupIndex].categories.length) {
        newSelection.groupIndex += 1;
        newSelection.categoryIndex = 0;
      }
    }

    if (newSelection.groupIndex < groups.length
      && newSelection.categoryIndex < groups[newSelection.groupIndex].categories.length) {
      setSelected(newSelection);
    }
  };

  const handleUp = () => {
    if (selected.groupIndex !== null && selected.categoryIndex !== null) {
      const newSelection = {
        groupIndex: selected.groupIndex,
        categoryIndex: selected.categoryIndex,
      };

      const filterParts = filter ? filter.toLowerCase().split(':') : [];

      do {
        newSelection.categoryIndex -= 1;

        if (newSelection.categoryIndex < 0) {
          newSelection.groupIndex -= 1;
          if (newSelection.groupIndex >= 0) {
            newSelection.categoryIndex = groups[newSelection.groupIndex]
              .categories.length - 1;
          }
        }
      } while (
        newSelection.groupIndex >= 0
        && (groups[newSelection.groupIndex].categories.length === 0
        || categoryFiltered(
          groups[newSelection.groupIndex],
          groups[newSelection.groupIndex].categories[newSelection.categoryIndex],
          filterParts,
        ))
      );

      if (newSelection.groupIndex >= 0
        && newSelection.categoryIndex >= 0) {
        setSelected(newSelection);
      }
    }
    else {
      setSelected({ groupIndex: 0, categoryIndex: 0 });
    }
  };

  const handleEnter = () => {
    if (selected.categoryIndex !== null) {
      let selectedGroup = null;
      if (selected.groupIndex !== null) {
        selectedGroup = groups[selected.groupIndex];
      }
      let selectedCategory = null;
      if (selectedGroup) {
        selectedCategory = selectedGroup.categories[selected.categoryIndex];
      }

      setOpen(false);
      if (selectedCategory === null) {
        setValue(null);
      }
      else {
        setValue(categoryTree.getCategoryName(selectedCategory.id));
        if (onChange) {
          onChange(selectedCategory);
        }
      }
    }
  };

  const handleKeydown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (open && selectorRef.current) {
      switch (event.key) {
        case 'Escape': {
          event.stopPropagation();
          event.preventDefault();
          handleCancel();
          break;
        }
        case 'ArrowDown':
          handleDown();
          break;
        case 'ArrowUp':
          handleUp();
          break;
        case 'Enter':
        case 'Tab':
          handleEnter();
          break;
        default:
      }
    }
    else if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete'
      || event.key === 'ArrowDown') {
      openDropDown();
    }
  };

  const renderSelector = () => {
    if (open && inputRef.current) {
      const position = inputRef.current.getBoundingClientRect();
      const containerRect = document.documentElement.getBoundingClientRect();

      let height = Math.min(containerRect.bottom - position.bottom, 250);
      let top = position.bottom;

      const topHeight = Math.min(position.top - containerRect.top, 250);

      if (topHeight > height) {
        height = topHeight;
        top = position.top - height;
      }

      const selectedGroup = selected.groupIndex !== null ? groups[selected.groupIndex] : null;
      let selectedCategory = null;
      if (selectedGroup !== null && selected.categoryIndex !== null) {
        selectedCategory = selectedGroup.categories[selected.categoryIndex];
      }

      const hiddenElement = document.querySelector('#hidden');

      if (hiddenElement) {
        return ReactDOM.createPortal(
          <CategorySelector
            ref={selectorRef}
            left={position.left}
            top={top}
            width={position.width < 200 ? 200 : position.width}
            height={height}
            selectedGroup={selectedGroup}
            selectedCategory={selectedCategory}
            onSelect={handleSelect}
            filter={filter}
          />,
          hiddenElement,
        );
      }

      return null;
    }

    return null;
  };

  return (
    <>
      <input
        ref={inputRef}
        className="category-input"
        type="text"
        placeholder="Unassigned"
        onClick={handleClick}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeydown}
        value={value || ''}
      />
      {renderSelector()}
    </>
  );
};

export default CategoryInput;
