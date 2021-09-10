import React, {
  useState, useRef, useEffect, useContext, ReactElement,
} from 'react';
import ReactDOM from 'react-dom';
import CategorySelector, { categoryFiltered } from './CategorySelector';
import useExclusiveBool from '../ExclusiveBool';
import MobxStore from '../state/mobxStore';
import { CategoryInterface } from '../state/State';
import { isGroup } from '../state/Group';
import { isCategory } from '../state/Category';
import { TreeNodeInterface } from '../state/CategoryTree';

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

  const initialValue = (): string => (
    categoryId === null || (categoryTree.unassignedCat && categoryId === categoryTree.unassignedCat.id)
      ? ''
      : (categoryTree.getCategoryName(categoryId) ?? '')
  );

  const [open, setOpen] = useExclusiveBool(false);
  const [value, setValue] = useState<string>(initialValue);
  const [originalValue, setOriginalValue] = useState<string>(initialValue);
  const [filter, setFilter] = useState<{ value: string, parts: string[]}>({
    value: initialValue(), parts: initialValue().toLowerCase().split(':'),
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectorRef = useRef<HTMLDivElement | null>(null);

  const handleCancel = () => {
    setOpen(false);
    setValue(originalValue);
    setFilter({ value: '', parts: [] });
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
    setValue(categoryTree.getCategoryName(category.id) ?? '');
    setOriginalValue(categoryId === null ? '' : (categoryTree.getCategoryName(categoryId) ?? ''));

    if (onChange) {
      onChange(category);
    }
  };

  const filtered = (groupIndex: number, categoryIndex: number, filterParts: string[]): boolean => {
    const node = nodes[groupIndex];
    return (isGroup(node) && (
      node.categories.length === 0
      || categoryFiltered(node, node.categories[categoryIndex], filterParts)
    )) || (isCategory(node) && categoryFiltered(null, node, filterParts));
  };

  const traverseList = (
    selection: Selection,
    moveOne: (selection: Selection) => boolean,
    filterParts: string[],
  ): Selection | null => {
    const newSelection: Selection = { ...selection };

    for (;;) {
      if (moveOne(newSelection)) {
        if (newSelection.groupIndex === null) {
          throw new Error('group index is null');
        }

        if (newSelection.categoryIndex === null) {
          throw new Error('category index is null');
        }

        if (!filtered(newSelection.groupIndex, newSelection.categoryIndex, filterParts)) {
          return newSelection;
        }
      }
      else {
        return null;
      }
    }
  }

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

  const setFirstBestSelection = (filterParts: string[]) => {
    const selection = traverseList({ groupIndex: null, categoryIndex: null }, moveDownOne, filterParts);
    if (selection === null) {
      setSelected({ groupIndex: null, categoryIndex: null })
    }
    else {
      setSelected(selection);
    }
  };

  const openDropDown = () => {
    const origValue = categoryId === null ? '' : (categoryTree.getCategoryName(categoryId) ?? '');
    setOriginalValue(origValue);
    setFilter({ value, parts: value.toLowerCase().split(':') });
    setOpen(true);
    setFirstBestSelection(filter.parts);
  };

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!open) {
      openDropDown();
    }
  };

  const handleFocus = () => {
    openDropDown();
  }

  const handleBlur = () => {
    setOpen(false);
  };

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

  const handleDown = (filterParts: string[]) => {
    const selection = traverseList(selected, moveDownOne, filterParts);
    if (selection !== null) {
      setSelected(selection);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    const newFilter = {
      value: event.target.value,
      parts: event.target.value !== '' ? event.target.value.toLowerCase().split(':') : [],
    };
    setFilter(newFilter);
    setFirstBestSelection(newFilter.parts);
  };

  const handleUp = (filterParts: string[]) => {
    const selection = traverseList(selected, moveUpOne, filterParts);
    if (selection !== null) {
      setSelected(selection);
    }
  };

  const handleEnter = () => {
    let selectedGroup: TreeNodeInterface | null = null;
    if (selected.groupIndex !== null) {
      selectedGroup = nodes[selected.groupIndex];

      if (isCategory(selectedGroup)) {
        setValue(categoryTree.getCategoryName(selectedGroup.id) ?? '');
        if (onChange) {
          onChange(selectedGroup);
        }
      }
      else if (isGroup(selectedGroup) && selectedGroup && selected.categoryIndex !== null) {
        const selectedCategory = selectedGroup.categories[selected.categoryIndex];
        setValue(categoryTree.getCategoryName(selectedCategory.id) ?? '');
        if (onChange) {
          onChange(selectedCategory);
        }
      }
      else {
        setValue('');
      }
    }

    setOpen(false);
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
          event.preventDefault();
          handleDown(filter.parts);
          break;
        case 'ArrowUp':
          event.preventDefault();
          handleUp(filter.parts);
          break;
        case 'Enter':
          event.preventDefault();
          handleEnter();
          break;
        case 'Tab':
          handleEnter();
          break;
        default:
      }
    }
    else if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete'
      || event.key === 'ArrowDown'
    ) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
      }

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
        const selectedGroup: TreeNodeInterface = nodes[selected.groupIndex];
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
  }

  return (
    <>
      <input
        ref={inputRef}
        className="category-input"
        type="text"
        placeholder="Unassigned"
        onClick={handleClick}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeydown}
        value={value || ''}
      />
      {renderSelector()}
    </>
  );
};

export default CategoryInput;
