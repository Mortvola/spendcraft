import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import CategorySelectorGroup from './CategorySelectorGroup';

const filterCategories = (categories, filter) => {
    let result = [];

    if (filter !== '') {
        result = categories.filter((c) => c.name.toLowerCase().includes(filter));
    }
    else {
        // No filter. Allow all of the categories.
        result = categories;
    }

    return result;
};

const filterGroup = (group, parts) => {
    let categories = [];

    if (parts.length === 1) {
        // No colon. Filter can be applied to both group and categories.
        if (group.name.toLowerCase().includes(parts[0])) {
            categories = group.categories;
        }
        else {
            categories = filterCategories(group.categories, parts[0]);
        }
    }
    else if (parts.length === 2) {
        // If the group contains the first part of the filter then
        // consider adding the categories
        if (parts[0] === '' || group.name.toLowerCase().includes(parts[0])) {
            categories = filterCategories(group.categories, parts[1]);
        }
    }

    return categories;
};

const mapStateToProps = (state, { filter }) => {
    if (filter) {
        const parts = filter.toLowerCase().split(':');

        const filteredGroups = [];

        state.categoryTree.groups.forEach((group) => {
            const categories = filterGroup(group, parts);

            if (categories.length > 0) {
                filteredGroups.push({ ...group, categories });
            }
        });

        return {
            groups: state.categoryTree.groups,
            filteredGroups,
        };
    }

    return {
        filteredGroups: state.categoryTree.groups,
    };
};

const CategorySelector = React.forwardRef(({
    filteredGroups,
    selectedGroup,
    selectedCategory,
    visible,
    left,
    top,
    width,
    height,
    onSelect,
}, forwardRef) => {
    let style = { display: 'none' };

    if (visible) {
        style = {
            left, top, width, height,
        };
    }

    return (
        <div ref={forwardRef} className="drop-down" style={style}>
            {
                filteredGroups && filteredGroups.map((g) => {
                    let sel = null;
                    if (selectedGroup !== null && selectedCategory !== null
                        && selectedGroup.name === g.name) {
                        sel = selectedCategory.name;
                    }

                    return (
                        <CategorySelectorGroup
                            key={g.id}
                            group={g}
                            selected={sel}
                            onSelected={onSelect}
                        />
                    );
                })
            }
        </div>
    );
});

CategorySelector.propTypes = {
    visible: PropTypes.bool.isRequired,
    left: PropTypes.number,
    top: PropTypes.number,
    width: PropTypes.number,
    height: PropTypes.number,
    onSelect: PropTypes.func,
    filteredGroups: PropTypes.arrayOf(PropTypes.shape()),
    selectedGroup: PropTypes.shape(),
    selectedCategory: PropTypes.shape(),
};

CategorySelector.defaultProps = {
    left: null,
    top: null,
    width: null,
    height: null,
    onSelect: null,
    filteredGroups: null,
    selectedGroup: null,
    selectedCategory: null,
};

export default connect(mapStateToProps, null, null, { forwardRef: true })(CategorySelector);
