import React from 'react';
import ReactDOM from 'react-dom';
import CategorySelector, { categoryFiltered } from './CategorySelector';
import useExclusiveBool from '../ExclusiveBool';
import { useStores } from '../State/Store';
import { TreeNodeInterface, CategoryInterface, GroupInterface } from '../State/Types';
import { isGroup } from '../State/Group';
import { isCategory } from '../State/Category';
import { CategoryType } from '../../common/ResponseTypes';

type PropsType = {
  categoryId?: number | null,
  value?: string,
  name?: string,
  onCategoryChange?: (category: CategoryInterface) => void,
  className?: string,
  types?: CategoryType[],
}

const CategoryInput: React.FC<PropsType> = ({
  categoryId = null,
  value,
  name,
  onCategoryChange,
  className,
  types,
}) => {
  const { categoryTree } = useStores();
  const { budget } = categoryTree;

  // type Selection = { groupIndex: number | null, categoryIndex: number | null};
  // const [selected, setSelected] = useState<Selection>(
  //   { groupIndex: null, categoryIndex: null },
  // );
  const [selectedCategory, setSelectedCategory] = React.useState<CategoryInterface | null>(
    categoryId !== null ? categoryTree.getCategory(categoryId) : null,
  )

  const initialValue = (): string => {
    if (value !== undefined) {
      return (
        (categoryTree.unassignedCat && parseInt(value, 10) === categoryTree.unassignedCat.id)
          ? ''
          : (categoryTree.getCategoryName(parseInt(value, 10)) ?? '')
      )
    }

    return (
      categoryId === null || (categoryTree.unassignedCat && categoryId === categoryTree.unassignedCat.id)
        ? ''
        : (categoryTree.getCategoryName(categoryId) ?? '')
    )
  };

  const [open, setOpen] = useExclusiveBool(false);
  const [inputValue, setInputValue] = React.useState<string>(initialValue);
  const [originalValue, setOriginalValue] = React.useState<string>(initialValue);
  const [filter, setFilter] = React.useState<{ value: string, parts: string[]}>({
    // value: initialValue(), parts: initialValue().toLowerCase().split(':'),
    value: '', parts: [],
  });
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const selectorRef = React.useRef<HTMLDivElement | null>(null);

  const handleCancel = () => {
    setOpen(false);
    setInputValue(originalValue);
    setFilter({ value: '', parts: [] });
  };

  const handleSelect = (category: CategoryInterface) => {
    // let groupIndex: number | null = null
    // let categoryIndex: number;

    // if (category.id === categoryTree.unassignedCat?.id) {
    //   categoryIndex = categoryTree.unassignedCat.id
    // }
    // else if (category.id === categoryTree.budget.fundingPoolCat?.id) {
    //   categoryIndex = categoryTree.budget.fundingPoolCat.id
    // }
    // else {
    //   groupIndex = budget.children
    //     .findIndex((g) => g.id === category.id || g.id === category.group!.id);

    //   const group = budget.children[groupIndex];
    //   if (isGroup(group)) {
    //     categoryIndex = group.children.findIndex((c) => c.id === category.id);
    //   }
    //   else {
    //     categoryIndex = groupIndex;
    //     groupIndex = null;
    //   }
    // }

    setSelectedCategory(category);
    setOpen(false);
    setInputValue(categoryTree.getCategoryName(category.id) ?? '');
    setOriginalValue(categoryId === null ? '' : (categoryTree.getCategoryName(categoryId) ?? ''));

    if (onCategoryChange) {
      onCategoryChange(category);
    }
  };

  const filtered = (groupIndex: number, categoryIndex: number, filterParts: string[]): boolean => {
    const node = budget.children[groupIndex];
    return (isGroup(node) && (
      node.children.length === 0
      || categoryFiltered(node, node.children[categoryIndex], filterParts)
    )) || (isCategory(node) && categoryFiltered(null, node, filterParts));
  };

  // const traverseList = (
  //   selection: Selection,
  //   moveOne: (selection: Selection) => boolean,
  //   filterParts: string[],
  // ): Selection | null => {
  //   const newSelection: Selection = { ...selection };

  //   for (;;) {
  //     if (moveOne(newSelection)) {
  //       if (newSelection.groupIndex === null) {
  //         throw new Error('group index is null');
  //       }

  //       if (newSelection.categoryIndex === null) {
  //         throw new Error('category index is null');
  //       }

  //       if (!filtered(newSelection.groupIndex, newSelection.categoryIndex, filterParts)) {
  //         return newSelection;
  //       }
  //     }
  //     else {
  //       return null;
  //     }
  //   }
  // }

  // const moveDownOne = (newSelection: Selection): boolean => {
  //   if (selectedCategory === null) {
  //     setSelectedCategory(categoryTree.unassignedCat)

  //     return true
  //   }

  //   if (selectedCategory === categoryTree.unassignedCat) {
  //     setSelectedCategory(categoryTree.budget.fundingPoolCat)

  //     return true
  //   }

  //   let node = budget.children[newSelection.groupIndex];
  //   if (isCategory(node)) {
  //     if (newSelection.groupIndex < budget.children.length - 1) {
  //       newSelection.groupIndex += 1;
  //       node = budget.children[newSelection.groupIndex];
  //       newSelection.categoryIndex = 0;
  //     }
  //     else {
  //       return false;
  //     }
  //   }
  //   else if (newSelection.categoryIndex < (node as GroupInterface).children.length - 1) {
  //     newSelection.categoryIndex += 1;
  //   }
  //   else if (newSelection.groupIndex < budget.children.length - 1) {
  //     newSelection.groupIndex += 1;
  //     node = budget.children[newSelection.groupIndex];
  //     newSelection.categoryIndex = 0;
  //   }
  //   else {
  //     // Could not move down
  //     return false;
  //   }

  //   return true;
  // }

  const setFirstBestSelection = (filterParts: string[]) => {
    // const selection = traverseList({ groupIndex: null, categoryIndex: null }, moveDownOne, filterParts);
    // if (selection === null) {
    //   setSelected({ groupIndex: null, categoryIndex: null })
    // }
    // else {
    //   setSelected(selection);
    // }
  };

  const openDropDown = () => {
    const origValue = categoryId === null ? '' : (categoryTree.getCategoryName(categoryId) ?? '');
    setOriginalValue(origValue);
    // setFilter({ value: inputValue, parts: inputValue.toLowerCase().split(':') });
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

  // const moveUpOne = (newSelection: Selection): boolean => {
  //   if (newSelection.groupIndex === null || newSelection.categoryIndex === null) {
  //     newSelection.groupIndex = 0;
  //     newSelection.categoryIndex = 0;
  //   }
  //   else {
  //     let node = budget.children[newSelection.groupIndex];
  //     if (isCategory(node)) {
  //       if (newSelection.groupIndex > 0) {
  //         newSelection.groupIndex -= 1;
  //         node = budget.children[newSelection.groupIndex];
  //         newSelection.categoryIndex = 0;
  //         if (isGroup(node) && node.children.length > 0) {
  //           newSelection.categoryIndex = node.children.length - 1;
  //         }
  //       }
  //       else {
  //         return false;
  //       }
  //     }
  //     else if (newSelection.categoryIndex > 0) {
  //       newSelection.categoryIndex -= 1;
  //     }
  //     else if (newSelection.groupIndex > 0) {
  //       newSelection.groupIndex -= 1;
  //       node = budget.children[newSelection.groupIndex];
  //       newSelection.categoryIndex = 0;
  //       if (isGroup(node) && node.children.length > 0) {
  //         newSelection.categoryIndex = node.children.length - 1;
  //       }
  //     }
  //     else {
  //       // Could not move up
  //       return false;
  //     }
  //   }

  //   return true;
  // }

  // const handleDown = (filterParts: string[]) => {
  //   const selection = traverseList(selected, moveDownOne, filterParts);
  //   if (selection !== null) {
  //     setSelected(selection);
  //   }
  // };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
    const newFilter = {
      value: event.target.value,
      parts: event.target.value !== '' ? event.target.value.toLowerCase().split(':') : [],
    };
    setFilter(newFilter);
    setFirstBestSelection(newFilter.parts);
  };

  // const handleUp = (filterParts: string[]) => {
  //   const selection = traverseList(selected, moveUpOne, filterParts);
  //   if (selection !== null) {
  //     setSelected(selection);
  //   }
  // };

  const handleEnter = () => {
    // let selectedGroup: TreeNodeInterface | null = null;
    // if (selected.groupIndex !== null) {
    //   selectedGroup = budget.children[selected.groupIndex];

    //   if (isCategory(selectedGroup)) {
    //     setInputValue(categoryTree.getCategoryName(selectedGroup.id) ?? '');
    //     if (onCategoryChange) {
    //       onCategoryChange(selectedGroup);
    //     }
    //   }
    //   else if (isGroup(selectedGroup) && selectedGroup && selected.categoryIndex !== null) {
    //     const selectedCategory = selectedGroup.children[selected.categoryIndex];
    //     setInputValue(categoryTree.getCategoryName(selectedCategory.id) ?? '');
    //     if (onCategoryChange && isCategory(selectedCategory)) {
    //       onCategoryChange(selectedCategory);
    //     }
    //   }
    //   else {
    //     setInputValue('');
    //   }
    // }

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

  React.useEffect(() => {
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
        // case 'ArrowDown':
        //   event.preventDefault();
        //   handleDown(filter.parts);
        //   break;
        // case 'ArrowUp':
        //   event.preventDefault();
        //   handleUp(filter.parts);
        //   break;
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
      const input = element.getBoundingClientRect();
      const containerRect = document.documentElement.getBoundingClientRect();

      let height = Math.min(containerRect.bottom - input.bottom, 250);
      let top = input.bottom;

      const topHeight = Math.min(input.top - containerRect.top, 250);

      if (topHeight > height) {
        height = topHeight;
        top = input.top - height;
      }

      // let selectedCategory: CategoryInterface | null = null;
      // if (selected.groupIndex !== null) {
      //   const selectedGroup: TreeNodeInterface = budget.children[selected.groupIndex];
      //   if (isGroup(selectedGroup)) {
      //     if (selected.categoryIndex === null) {
      //       throw new Error('category index is null');
      //     }

      //     const cat = selectedGroup.children[selected.categoryIndex];

      //     if (isCategory(cat)) {
      //       selectedCategory = cat
      //     }
      //   }
      //   else {
      //     if (!isCategory(selectedGroup)) {
      //       throw new Error('group is not a category');
      //     }

      //     selectedCategory = selectedGroup;
      //   }
      // }

      const hiddenElement = document.querySelector('#hidden');

      if (hiddenElement) {
        const viewport = window.visualViewport;

        if (viewport === null) {
          throw new Error('viewport is null');
        }

        return ReactDOM.createPortal(
          <CategorySelector
            ref={selectorRef}
            left={input.left + viewport.offsetLeft}
            top={top + viewport.offsetTop}
            width={input.width < 200 ? 200 : input.width}
            height={height}
            selectedCategory={selectedCategory}
            onSelect={handleSelect}
            filter={filter.parts}
            types={types}
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
        // className={`category-input ${className ?? ''}`}
        className={className ?? ''}
        type="text"
        placeholder="Unassigned"
        onClick={handleClick}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeydown}
        value={inputValue || ''}
        name={name}
      />
      {renderSelector()}
    </>
  );
};

export default CategoryInput;
