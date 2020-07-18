import React from 'react';
import PropTypes from 'prop-types';
import categoryList from '../Categories';
import { createSelector, closeSelector, selectorRef } from './CategorySelector';

class CategoryInput extends React.Component {
    constructor(props) {
        super(props);

        const { categoryId } = this.props;

        let categoryName = '';
        if (categoryId) { // && categoryList) {
            categoryName = categoryList.getCategoryName(categoryId);
        }

        this.state = {
            value: categoryName,
        };

        this.previousValue = categoryName;

        this.inputRef = React.createRef();

        this.handleClick = this.handleClick.bind(this);
        this.handleChange = this.handleChange.bind(this);
        this.handleBlur = this.handleBlur.bind(this);
        this.handleKeydown = this.handleKeydown.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.handleSelect = this.handleSelect.bind(this);

        //        $(document).on('category', (event, categories) => {
        //            if (this.props.categoryId) { // && categoryList) {
        //                categoryName = categoryList.getCategoryName (this.props.categoryId);
        //                console.log ("Category name " + categoryName)
        //            }
        //        });
    }

    openSelector() {
        if (this.inputRef.current) {
            const position = this.inputRef.current.getBoundingClientRect();

            createSelector({
                left: position.left,
                top: position.bottom,
                width: position.right - position.left,
                height: 100,
                visible: true,
                owner: this,
                onCancel: this.handleCancel,
                onSelect: this.handleSelect,
            });
        }
    }

    handleClick(event) {
        if (selectorRef.current) {
            if (selectorRef.current.getOwner() !== this) {
                event.stopPropagation();
                this.openSelector();
            }
            else if (selectorRef.current.visible()) {
                event.stopPropagation();
            }
        }
    }

    handleSelect(group, category) {
        const { onChange } = this.props;

        this.selection = { group, category };
        closeSelector();
        this.setState({ value: categoryList.getCategoryName(category.id) });

        if (onChange) {
            onChange(category.id);
        }
    }

    handleCancel() {
        closeSelector();
        this.setState({ value: this.previousValue });
    }

    handleChange(event) {
        this.setState({ value: event.target.value });

        if (selectorRef.current) {
            selectorRef.current.setState({ filter: event.target.value });
        }
    }

    handleBlur(event) {
        /*
        if (selectorRef.current.visible ()) {
            selectorRef.current.cancel ();
        }
        */
    }

    handleKeydown(event) {
        if (selectorRef.current.visible()) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.handleCancel();
            }
            else if (event.key === 'ArrowDown') {
                selectorRef.current.down();
            }
            else if (event.key === 'ArrowUp') {
                selectorRef.current.up();
            }
            else if (event.key === 'Enter') {
                selectorRef.current.enter();
            }
            else if (event.key === 'Tab') {
                selectorRef.current.enter();
            }
        }
        else if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete'
                || event.key === 'ArrowDown') {
            this.openSelector();
        }
    }

    render() {
        const { value } = this.state;

        return (
            <input
                ref={this.inputRef}
                className="category-input"
                type="text"
                placeholder="Unassigned"
                onClick={this.handleClick}
                onChange={this.handleChange}
                onBlur={this.handleBlur}
                onKeyDown={this.handleKeydown}
                value={value}
            />
        );
    }
}

CategoryInput.propTypes = {
    categoryId: PropTypes.number,
    onChange: PropTypes.func.isRequired,
};

CategoryInput.defaultProps = {
    categoryId: null,
};

export default CategoryInput;
