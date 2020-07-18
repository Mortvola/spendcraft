import React from 'react';
import PropTypes from 'prop-types';

class CategorySelectorCategory extends React.Component {
    constructor(props) {
        super(props);

        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleClick = this.handleClick.bind(this);

        this.ref = React.createRef();
    }

    componentDidUpdate() {
        const { selected } = this.props;

        if (selected && this.ref.current) {
            this.ref.current.scrollIntoView(false);
        }
    }

    handleClick(event) {
        const { onClick } = this.props;

        event.stopPropagation();
        onClick();
    }

    handleMouseDown(event) {
        const { onSelected, category } = this.props;

        event.preventDefault();
        event.stopPropagation();
        onSelected(category);
    }

    render() {
        const { selected, onSelected, category } = this.props;

        let className = 'cat-list-cat category-list-item category-select-item';

        if (selected) {
            className += ' selected';
            onSelected(category);
        }

        return (
            <div
                className={className}
                onMouseDown={this.handleMouseDown}
                onClick={this.handleClick}
                ref={this.ref}
            >
                {category.name}
            </div>
        );
    }
}

CategorySelectorCategory.propTypes = {
    onClick: PropTypes.func.isRequired,
    onSelected: PropTypes.func.isRequired,
    selected: PropTypes.bool.isRequired,
    category: PropTypes.shape().isRequired,
};

export default CategorySelectorCategory;
