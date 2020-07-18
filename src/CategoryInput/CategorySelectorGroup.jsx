import React from 'react';
import PropTypes from 'prop-types';
import CategorySelectorCategory from './CategorySelectorCategory';

function CategorySelectorGroup(props) {
    const handleMouseDown = (event) => {
        event.preventDefault();
    };

    const handleClick = (event) => {
        event.stopPropagation();
    };

    const handleSelected = (category) => {
        props.onSelected(props.group, category);
    };

    const filterCategories = (categories, filter) => {
        let result = [];

        if (filter !== '') {
            categories.forEach((c) => {
                if (c.name.toLowerCase().includes(filter)) {
                    result.push(c);
                }
            });
        }
        else {
            // No filter. Allow all of the categories.
            result = categories;
        }

        return result;
    };

    const filterGroup = () => {
        let categories = [];

        const parts = props.filter.toLowerCase().split(':');

        if (parts.length === 1) {
            // No colon. Filter can be applied to both group and categories.
            categories = filterCategories(props.group.categories, parts[0]);
        }
        else if (parts.length === 2) {
            // If the group contains the first part of the filter then
            // consider adding the categories
            if (parts[0] === '' || props.group.name.toLowerCase().includes(parts[0])) {
                categories = filterCategories(props.group.categories, parts[1]);
            }
        }

        return categories;
    };

    const categories = filterGroup();

    if (categories.length > 0) {
        return (
            <div
                className="category-list-item"
                onMouseDown={handleMouseDown}
                onClick={handleClick}
            >
                {props.group.name}
                {categories.map((c) => (
                    <CategorySelectorCategory
                        key={c.id}
                        category={c}
                        selected={c.name === props.selected}
                        onSelected={handleSelected}
                        onClick={props.onClick}
                    />
                ))}
            </div>
        );
    }

    return null;
}

CategorySelectorGroup.propTypes = {
    onSelected: PropTypes.func.isRequired,
    group: PropTypes.shape({
        name: PropTypes.string.isRequierd,
        categories: PropTypes.array.isRequired,
    }).isRequired,
    filter: PropTypes.string.isRequired,
    selected: PropTypes.bool,
    onClick: PropTypes.func.isRequired,
};

CategorySelectorGroup.defaultProps = {
    selected: null,
};

export default CategorySelectorGroup;
