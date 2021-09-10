import React, {
  useState, useRef, useEffect, useContext, ReactElement,
} from 'react';
import ReactDOM from 'react-dom';
import CategorySelector, { categoryFiltered } from './CategorySelector';
import useExclusiveBool from '../ExclusiveBool';
import MobxStore from '../state/mobxStore';
import { CategoryInterface, GroupInterface } from '../state/State';
import { isGroup } from '../state/Group';
import { isCategory } from '../state/Category';

type PropsType = {
  categoryId: number | null,
  onChange: (category: CategoryInterface) => void,
}

const CategoryInput = ({
  categoryId = null,
  onChange,
}: PropsType): ReactElement => {
  const { categoryTree } = useContext(MobxStore);
  const { nodes } = categoryTree;

  type Selection = { groupIndex: number | null, categoryIndex: number | null};
  const [selected, setSelected] = useState<Selection>(
    { groupIndex: null, categoryIndex: null },
  );

  const [open, setOpen] = useExclusiveBool(false);
  const [value, setValue] = useState<string | null>(
    categoryId === null || (categoryTree.unassignedCat && categoryId === categoryTree.unassignedCat.id)
      ? null
      : categoryTree.getCategoryName(categoryId),
  );
  const [originalValue, setOriginalValue] = useState<string | null>(
    categoryId === null || (categoryTree.unassignedCat && categoryId === categoryTree.unassignedCat.id)
      ? null
      : categoryTree.getCategoryName(categoryId),
  );
  const [filter, setFilter] = useState<{ value: string, parts: string[]}>({ value: '', parts: [] });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectorRef = useRef<HTMLDivElement | null>(null);

  const handleCancel = () => {
    setOpen(false);
    setValue(originalValue);
    setFilter({ value: '', parts: [] });
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

  const handleSelect = (category: CategoryInterface) => {
    let groupIndex: number | null = nodes.findIndex((g) => g.id === category.id || g.id === category.groupId);
    let categoryIndex: number;

    const group = nodes[groupIndex];
    if (isGroup(group)) {
      categoryIndex = group.categories.findIndex((c) => c.id === category.id);
    }
    else {
      categoryIndex = groupIndex;
      groupIndex = null;
    }

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
    setFilter({
      value: event.target.value,
      parts: event.target.value !== '' ? event.target.value.toLowerCase().split(':') : [],
    });
  };

  const handleBlur = () => {
    setOpen(false);
  };

  const filtered = (groupIndex: number, categoryIndex: number): boolean => {
    const node = nodes[groupIndex];
    return (isGroup(node) && (
      node.categories.length === 0
      || categoryFiltered(node, node.categories[categoryIndex], filter.parts)
    )) || (isCategory(node) && categoryFiltered(null, node, filter.parts));
  };

  const traverseList = (moveOne: (selection: Selection) => boolean): Selection | null => {
    const newSelection: Selection = {
      groupIndex: selected.groupIndex,
      categoryIndex: selected.categoryIndex,
    };

    for (;;) {
      if (moveOne(newSelection)) {
        if (newSelection.groupIndex === null) {
          throw new Error('group index is null');
        }

        if (newSelection.categoryIndex === null) {
          throw new Error('category index is null');
        }

        if (!filtered(newSelection.groupIndex, newSelection.categoryIndex)) {
          return newSelection;
        }
      }
      else {
        return null;
      }
    }
  }

  const handleDown = () => {
    const moveDownOne = (newSelection: Selection): boolean => {
      if (newSelection.groupIndex === null || newSelection.categoryIndex === null) {
        newSelection.groupIndex = 0;
        newSelection.categoryIndex = 0;
      }
      else {
        let node = nodes[newSelection.groupIndex];
        if (isCategory(node)) {
          if (newSelection.groupIndex < nodes.length - 1) {
            newSelection.groupIndex += 1;
            node = nodes[newSelection.groupIndex];
            newSelection.categoryIndex = 0;
          }
          else {
            return false;
          }
        }
        else if (newSelection.categoryIndex < node.categories.length - 1) {
          newSelection.categoryIndex += 1;
        }
        else if (newSelection.groupIndex < nodes.length - 1) {
          newSelection.groupIndex += 1;
          node = nodes[newSelection.groupIndex];
          newSelection.categoryIndex = 0;
        }
        else {
          // Could not move down
          return false;
        }
      }

      return true;
    }

    const selection = traverseList(moveDownOne);
    if (selection !== null) {
      setSelected(selection);
    }
  };

  const handleUp = () => {
    const moveUpOne = (newSelection: Selection): boolean => {
      if (newSelection.groupIndex === null || newSelection.categoryIndex === null) {
        newSelection.groupIndex = 0;
        newSelection.categoryIndex = 0;
      }
      else {
        let node = nodes[newSelection.groupIndex];
        if (isCategory(node)) {
          if (newSelection.groupIndex > 0) {
            newSelection.groupIndex -= 1;
            node = nodes[newSelection.groupIndex];
            newSelection.categoryIndex = 0;
            if (isGroup(node) && node.categories.length > 0) {
              newSelection.categoryIndex = node.categories.length - 1;
            }
          }
          else {
            return false;
          }
        }
        else if (newSelection.categoryIndex > 0) {
          newSelection.categoryIndex -= 1;
        }
        else if (newSelection.groupIndex > 0) {
          newSelection.groupIndex -= 1;
          node = nodes[newSelection.groupIndex];
          newSelection.categoryIndex = 0;
          if (isGroup(node) && node.categories.length > 0) {
            newSelection.categoryIndex = node.categories.length - 1;
          }
        }
        else {
          // Could not move up
          return false;
        }
      }

      return true;
    }

    const selection = traverseList(moveUpOne);
    if (selection !== null) {
      setSelected(selection);
    }
  };

  const handleEnter = () => {
    if (selected.categoryIndex !== null) {
      let selectedGroup = null;
      if (selected.groupIndex !== null) {
        selectedGroup = nodes[selected.groupIndex];
      }
      let selectedCategory = null;
      if (selectedGroup && isGroup(selectedGroup)) {
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
    const element = inputRef.current;
    if (open && element) {
      const position = element.getBoundingClientRect();
      const containerRect = document.documentElement.getBoundingClientRect();

      let height = Math.min(containerRect.bottom - position.bottom, 250);
      let top = position.bottom;

      const topHeight = Math.min(position.top - containerRect.top, 250);

      if (topHeight > height) {
        height = topHeight;
        top = position.top - height;
      }

      let selectedCategory: CategoryInterface | null = null;
      if (selected.groupIndex !== null) {
        const selectedGroup: GroupInterface | CategoryInterface = nodes[selected.groupIndex];
        if (isGroup(selectedGroup)) {
          if (selected.categoryIndex === null) {
            throw new Error('category index is null');
          }

          selectedCategory = selectedGroup.categories[selected.categoryIndex];
        }
        else {
          if (!isCategory(selectedGroup)) {
            throw new Error('group is not a category');
          }

          selectedCategory = selectedGroup;
        }
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
            selectedCategory={selectedCategory}
            onSelect={handleSelect}
            filter={filter.parts}
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
