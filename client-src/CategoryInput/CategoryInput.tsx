import React, {
  useState, useRef, useEffect, useContext, ReactElement,
} from 'react';
import ReactDOM from 'react-dom';
import CategorySelector from './CategorySelector';
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
  const [selected, setSelected] = useState<{ groupIndex: number | null, categoryIndex: number | null }>(
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
  const [filter, setFilter] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectorRef = useRef<HTMLDivElement | null>(null);

  const categoryFiltered = (
    group: GroupInterface,
    category: CategoryInterface,
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

    const moveDown = (): boolean => {
      const selectable = (groupIndex: number, categoryIndex: number): boolean => {
        const node = nodes[groupIndex];
        return !(isGroup(node) && node.categories.length === 0)
      };

      const moveDownOne = (): boolean => {
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

      for (;;) {
        if (moveDownOne()) {
          if (newSelection.groupIndex === null) {
            throw new Error('group index is null');
          }

          if (newSelection.categoryIndex === null) {
            throw new Error('category index is null');
          }

          if (selectable(newSelection.groupIndex, newSelection.categoryIndex)) {
            return true;
          }
        }
        else {
          return false;
        }
      }
    }

    if (moveDown()) {
      setSelected(newSelection);
    }

    // if (newSelection.groupIndex === null) {
    //   throw new Error('group selection index is null');
    // }

    // let node = nodes[newSelection.groupIndex];

    // while (isGroup(node) && node.categories.length === 0) {
    //   moveDownOne();
    //   node = nodes[newSelection.groupIndex];
    // }

    // const filterParts = filter ? filter.toLowerCase().split(':') : [];

    // let node = nodes[newSelection.groupIndex];
    // // while (
    //   newSelection.groupIndex < nodes.length
    //   && ((isGroup(node) && (node.categories.length === 0
    //     || categoryFiltered(
    //       node,
    //       node.categories[newSelection.categoryIndex],
    //       filterParts,
    //     )))
    //   || isCategory(node))
    // for (;;) {
    // }

    // node = nodes[newSelection.groupIndex];
    // if (newSelection.groupIndex < nodes.length
    //   && (isCategory(node)
    //   || (isGroup(node) && newSelection.categoryIndex < node.categories.length))
    // ) {
    // setSelected(newSelection);
    // }
  };

  const handleUp = () => {
    const newSelection = {
      groupIndex: selected.groupIndex,
      categoryIndex: selected.categoryIndex,
    };

    const moveUp = (): boolean => {
      const selectable = (groupIndex: number, categoryIndex: number): boolean => {
        const node = nodes[groupIndex];
        return !(isGroup(node) && node.categories.length === 0)
      };

      const moveUpOne = (): boolean => {
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
              if (isGroup(node)) {
                newSelection.categoryIndex = node.categories.length - 1;
              }
            }
          }
          else if (newSelection.categoryIndex > 0) {
            newSelection.categoryIndex -= 1;
          }
          else if (newSelection.groupIndex > 0) {
            newSelection.groupIndex -= 1;
            node = nodes[newSelection.groupIndex];
            newSelection.categoryIndex = 0;
            if (isGroup(node)) {
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

      for (;;) {
        if (moveUpOne()) {
          if (newSelection.groupIndex === null) {
            throw new Error('group index is null');
          }

          if (newSelection.categoryIndex === null) {
            throw new Error('category index is null');
          }

          if (selectable(newSelection.groupIndex, newSelection.categoryIndex)) {
            return true;
          }
        }
        else {
          return false;
        }
      }
    }

    if (moveUp()) {
      setSelected(newSelection);
    }

    // if (selected.groupIndex !== null && selected.categoryIndex !== null) {
    //   const newSelection = {
    //     groupIndex: selected.groupIndex,
    //     categoryIndex: selected.categoryIndex,
    //   };

    //   const filterParts = filter ? filter.toLowerCase().split(':') : [];

    //   let group = nodes[newSelection.groupIndex];
    //   do {
    //     newSelection.categoryIndex -= 1;

    //     if (newSelection.categoryIndex < 0) {
    //       newSelection.groupIndex -= 1;
    //       group = nodes[newSelection.groupIndex];
    //       if (isGroup(group)) {
    //         if (newSelection.groupIndex >= 0) {
    //           newSelection.categoryIndex = group.categories.length - 1;
    //         }
    //       }
    //     }
    //   } while (
    //     newSelection.groupIndex >= 0
    //     && ((isGroup(group) && group.categories.length === 0)
    //     || (isGroup(group) && categoryFiltered(
    //       group,
    //       group.categories[newSelection.categoryIndex],
    //       filterParts,
    //     )))
    //   );

    //   if (newSelection.groupIndex >= 0
    //     && newSelection.categoryIndex >= 0) {
    //     setSelected(newSelection);
    //   }
    // }
    // else {
    //   setSelected({ groupIndex: 0, categoryIndex: 0 });
    // }
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
