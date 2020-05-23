import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import CategoryTransferDialog from './CategoryTransferDialog';
import IconButton from './IconButton';
import Amount from './Amount';
import { ModalLauncher } from './Modal';
import CategoryDialog from './CategoryDialog';
import GroupDialog from './GroupDialog';

const mapStateToProps = (state) => ({
    groups: state.categoryTree.groups,
});

const CategoryView = connect(mapStateToProps)(({
    onCategorySelected,
    categorySelected,
    groups,
}) => (
    <div id="categories">
        {groups.map((group) => (
            <GroupElement
                key={group.name}
                group={group}
                onCategorySelected={onCategorySelected}
                categorySelected={categorySelected}
            />
        ))}
    </div>
));

CategoryView.propTypes = {
    groups: PropTypes.arrayOf(PropTypes.shape),
    onCategorySelected: PropTypes.func.isRequired,
    categorySelected: PropTypes.number,
};

CategoryView.defaultProps = {
    groups: [],
    categorySelected: undefined,
};

function Buttons({ group }) {
    if (!group.system) {
        return (
            <>
                <ModalLauncher
                    launcher={(props) => (<IconButton icon="plus" {...props} />)}
                    title="Add Category"
                    dialog={(props) => (<CategoryDialog groupId={group.id} {...props} />)}
                />
                <ModalLauncher
                    launcher={(props) => (<IconButton icon="edit" {...props} />)}
                    title="Edit Group"
                    dialog={(props) => (<GroupDialog group={group} {...props} />)}
                />
            </>
        );
    }

    return null;
}

Buttons.propTypes = {
    group: PropTypes.shape({
        system: PropTypes.bool.isRequired,
        id: PropTypes.number.isRequired,
    }).isRequired,
};


function GroupElement({ group, onCategorySelected, categorySelected }) {
    return (
        <div className="cat-list-group">
            <div className="group-element-bar">
                <div className="group-name">{group.name}</div>
                <Buttons group={group} />
            </div>
            {group.categories.map((category) => (
                <CategoryElement
                    key={category.name}
                    category={category}
                    groupId={group.id}
                    systemGroup={group.system}
                    onCategorySelected={onCategorySelected}
                    selected={categorySelected === category.id}
                />
            ))}
        </div>
    );
}

GroupElement.propTypes = {
    group: PropTypes.shape({
        categories: PropTypes.arrayOf(PropTypes.shape),
        system: PropTypes.bool,
        name: PropTypes.string.isRequired,
        id: PropTypes.number.isRequired,
    }),
    onCategorySelected: PropTypes.func.isRequired,
    categorySelected: PropTypes.number,
};

GroupElement.defaultProps = {
    categorySelected: undefined,
    group: {
        categories: [],
        system: false,
    },
};

function EditButton({ category, groupId, systemGroup }) {
    if (!systemGroup) {
        return (
            <ModalLauncher
                launcher={(props) => (<IconButton icon="edit" {...props} />)}
                title="Edit Category"
                dialog={(props) => (
                    <CategoryDialog category={category} groupId={groupId} {...props} />
                )}
            />
        );
    }

    return null;
}

EditButton.propTypes = {
    category: PropTypes.shape({
        id: PropTypes.number.isRequired,
    }).isRequired,
    groupId: PropTypes.number.isRequired,
    systemGroup: PropTypes.bool.isRequired,
};


function CategoryElement({
    category,
    groupId,
    systemGroup,
    selected,
    onCategorySelected,
}) {
    const handleClick = () => {
        onCategorySelected(category.id);
    };

    let className = 'cat-list-cat';
    if (selected) {
        className += ' selected';
    }

    return (
        <div className={className} onClick={handleClick}>
            <div className="cat-element-bar">
                <EditButton category={category} groupId={groupId} systemGroup={systemGroup} />
                <ModalLauncher
                    launcher={(props) => (<IconButton icon="random" {...props} />)}
                    title="Category Transfer"
                    dialog={(props) => (<CategoryTransferDialog {...props} />)}
                />
                <div className="cat-list-name">{category.name}</div>
            </div>
            <Amount className="cat-list-amt" dataCat={category.id} amount={category.amount} />
        </div>
    );
}

CategoryElement.propTypes = {
    category: PropTypes.shape({
        id: PropTypes.number.isRequired,
        amount: PropTypes.number,
        name: PropTypes.string.isRequired,
    }),
    groupId: PropTypes.number.isRequired,
    systemGroup: PropTypes.bool.isRequired,
    onCategorySelected: PropTypes.func.isRequired,
    selected: PropTypes.bool.isRequired,
};

CategoryElement.defaultProps = {
    category: {
        amount: 0,
    },
};

export default CategoryView;
