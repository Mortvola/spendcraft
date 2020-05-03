import React from 'react';
import PropTypes, { array } from 'prop-types';
import catTransferDialog from './CategoryTransferDialog';
import { openEditCategoryDialog } from './CategoryDialog';
import categoryList from './Categories';
import IconButton from './IconButton';
import Amount from './Amount';

class CategoryView extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            categories: (categoryList && categoryList.categories ? categoryList.categories : []),
        };

        $(document).on('category', (event, response) => {
            this.setState({ categories: response });
        });
    }

    render() {
        const { categories } = this.state;
        const { onCategorySelected, categorySelected } = this.props;

        return (
            <div id="categories">
                {categories.map((group) => (
                    <GroupElement
                        key={group.name}
                        group={group}
                        onCategorySelected={onCategorySelected}
                        categorySelected={categorySelected}
                    />
                ))}
            </div>
        );
    }
}

CategoryView.propTypes = {
    onCategorySelected: PropTypes.func.isRequired,
    categorySelected: PropTypes.number,
};

CategoryView.defaultProps = {
    categorySelected: undefined,
};

function Buttons({ group }) {
    if (!group.system) {
        return (
            <>
                <IconButton icon="plus" onClick={() => openAddCategoryDialog(group.id, group.system, null)} />
                <IconButton icon="edit" onClick={() => openGroupDialog(group.id, null)} />
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
        categories: array.isRequired,
        system: PropTypes.bool.isRequired,
        name: PropTypes.string.isRequired,
        id: PropTypes.number.isRequired,
    }).isRequired,
    onCategorySelected: PropTypes.func.isRequired,
    categorySelected: PropTypes.number,
};

GroupElement.defaultProps = {
    categorySelected: undefined,
};

function EditButton({ category, groupId, systemGroup }) {
    if (!systemGroup) {
        return (
            <IconButton icon="edit" onClick={() => openEditCategoryDialog(groupId, category.id, null)} />
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


function CategoryElement({ category, groupId, systemGroup, selected, onCategorySelected }) {
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
                <IconButton icon="random" onClick={catTransferDialog} />
                <div className="cat-list-name">{category.name}</div>
            </div>
            <Amount className="cat-list-amt" dataCat={category.id} amount={category.amount} />
        </div>
    );
}

CategoryElement.propTypes = {
    category: PropTypes.shape({
        id: PropTypes.number.isRequired,
        amount: PropTypes.number.isRequired,
        name: PropTypes.string.isRequired,
    }).isRequired,
    systemGroup: PropTypes.bool.isRequired,
    onCategorySelected: PropTypes.func.isRequired,
    selected: PropTypes.bool.isRequired,
};

export default CategoryView;
