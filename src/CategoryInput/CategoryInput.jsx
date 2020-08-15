import React, { useState, useRef, useEffect } from 'react';
import { connect } from 'react-redux';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import CategorySelector from './CategorySelector';
import useExclusiveBool from '../ExclusiveBool';

const mapStateToProps = (state) => ({
    groups: state.categoryTree.groups,
});

const getCategoryName = (groups, categoryId) => {
    let categoryName = null;

    groups.find((group) => {
        const category = group.categories.find((cat) => cat.id === categoryId);

        if (category) {
            categoryName = `${group.name}:${category.name}`;
            return true;
        }

        return false;
    });

    return categoryName;
};

const CategoryInput = ({
    categoryId,
    groups,
    onChange,
}) => {
    const [selected, setSelected] = useState({ groupIndex: null, categoryIndex: null });
    const [open, setOpen] = useExclusiveBool(false);
    const [value, setValue] = useState(getCategoryName(groups, categoryId));
    const [originalValue, setOriginalValue] = useState(getCategoryName(groups, categoryId));
    const [filter, setFilter] = useState(null);
    const inputRef = useRef(null);
    const selectorRef = useRef(null);

    const categoryFiltered = (group, category, filterParts) => {
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

    const handleMouseDown = (event) => {
        if (!inputRef.current.contains(event.target)
            && (selectorRef.current === null || !selectorRef.current.contains(event.target))) {
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
        setOriginalValue(getCategoryName(groups, categoryId));
        setOpen(true);
    };

    const handleClick = (event) => {
        event.stopPropagation();
        if (!open) {
            openDropDown();
        }
    };

    const handleSelect = (group, category) => {
        const groupIndex = groups.findIndex((g) => g.id === group.id);
        const categoryIndex = groups[groupIndex].categories.findIndex((c) => c.id === category.id);

        setSelected({ groupIndex, categoryIndex });
        setOpen(false);
        setValue(getCategoryName(groups, category.id));
        setOriginalValue(getCategoryName(groups, categoryId));

        if (onChange) {
            onChange(category.id);
        }
    };

    const handleChange = (event) => {
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
            && categoryFiltered(
                groups[newSelection.groupIndex],
                groups[newSelection.groupIndex].categories[newSelection.categoryIndex],
                filterParts,
            )
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
                && categoryFiltered(
                    groups[newSelection.groupIndex],
                    groups[newSelection.groupIndex].categories[newSelection.categoryIndex],
                    filterParts,
                )
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
            const selectedGroup = groups[selected.groupIndex];
            let selectedCategory = null;
            if (selectedGroup) {
                selectedCategory = selectedGroup.categories[selected.categoryIndex];
            }

            setOpen(false);
            setValue(getCategoryName(groups, selectedCategory.id));

            if (onChange) {
                onChange(selectedCategory.id);
            }
        }
    };

    const handleKeydown = (event) => {
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
            if (selectedGroup) {
                selectedCategory = selectedGroup.categories[selected.categoryIndex];
            }

            return ReactDOM.createPortal(
                <CategorySelector
                    ref={selectorRef}
                    left={position.left}
                    top={top}
                    width={position.width}
                    height={height}
                    selectedGroup={selectedGroup}
                    selectedCategory={selectedCategory}
                    onCancel={handleCancel}
                    onSelect={handleSelect}
                    filter={filter}
                />,
                document.querySelector('#hidden'),
            );
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

CategoryInput.propTypes = {
    categoryId: PropTypes.number,
    groups: PropTypes.arrayOf(PropTypes.shape()),
    onChange: PropTypes.func.isRequired,
};

CategoryInput.defaultProps = {
    categoryId: null,
    groups: null,
};

export default connect(mapStateToProps)(CategoryInput);
