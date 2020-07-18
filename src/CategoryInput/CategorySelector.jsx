import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import categoryList from '../Categories';
import CategorySelectorGroup from './CategorySelectorGroup';

class CategorySelector extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            categories: categoryList.categories,
            filter: '',
            selected: { group: null, category: null },
        };

        this.selection = {};

        this.owner = null;
        this.listRef = React.createRef();
        this.selectedRef = React.createRef();

        this.handleSelected = this.handleSelected.bind(this);
        this.handleClick = this.handleClick.bind(this);

        $(document).on('category', (_event, categories) => {
            this.setState({ categories });
        });
    }

    componentDidUpdate(prevProps) {
        const { visible } = this.props;
        const { filter, selected } = this.state;

        // If we are changing from hidden to visible then
        // reset state back to original
        if (!prevProps.visible && visible
            && (filter !== '' || selected.group !== null || selected.category !== null)) {
            this.setState({ filter: '', selected: { group: null, category: null } });
        }
    }

    getOwner() {
        const { owner } = this.props;

        return owner;
    }

    setSelected(newSelected) {
        const group = newSelected.parent().contents().filter(function () {
            return this.nodeType === 3;
        }).text();
        const category = newSelected.text();

        this.setState({ selected: { group, category } });
    }

    handleSelected(group, category) {
        this.selection.group = group;
        this.selection.category = category;
    }

    handleClick() {
        const { onSelect } = this.props;

        if (this.selection && this.selection.group && this.selection.category) {
            onSelect(this.selection.group, this.selection.category);
        }
    }

    visible() {
        const { visible } = this.props;

        return visible;
    }

    cancel() {
        $(this.owner).val(this.previousValue);
        this.hide();
    }

    hide() {
        //        this.categoryDropDownList.hide ();
        this.setOwner(null);
    }

    down() {
        if (this.listRef.current) {
            let selected = $(this.listRef.current).find('.cat-list-cat.selected');

            if (selected.length > 0) {
                let next = selected.next();

                if (next.length > 0) {
                    this.setSelected(next);
                }
                else {
                    next = selected.parent().next().children().first();

                    if (next.length > 0) {
                        this.setSelected(next);
                    }
                }
            }
            else {
                selected = $(this.listRef.current).find('.cat-list-cat').first().addClass('selected');
                this.setSelected(selected);
            }
        }

        return null;
    }

    up() {
        if (this.listRef.current) {
            const selected = $(this.listRef.current).find('.cat-list-cat.selected');

            if (selected.length > 0) {
                let prev = selected.prev();

                if (prev.length > 0) {
                    this.setSelected(prev);
                }
                else {
                    prev = selected.parent().prev().children().last();

                    if (prev.length > 0) {
                        this.setSelected(prev);
                    }
                }
            }
        }
    }

    enter() {
        this.handleClick();
    }

    render() {
        const { categories, selected, filter } = this.state;
        const {
            visible,
            left,
            top,
            width,
            height,
            onCancel,
        } = this.props;
        let style = { display: 'none' };

        if (visible) {
            style = {
                left, top, width, height,
            };

            this.clickHandler = $(window).on('click.categorySelector', (event) => {
                if (visible) { // && event.target !== this.owner.inputRef) {
                    event.stopPropagation();
                    onCancel();
                    //                  this.cancel ();
                    //                    this.setState({visible: false})
                }
            });
        }
        else {
            $(window).off('click.categorySelector');
        }

        if (categories) {
            return (
                <div ref={this.listRef} className="drop-down" style={style}>
                    {
                        categories.map((g) => {
                            let sel = null;
                            if (selected.group === g.name) {
                                sel = selected.category;
                            }
                            return (
                                <CategorySelectorGroup
                                    key={g.id}
                                    group={g}
                                    selected={sel}
                                    filter={filter}
                                    onSelected={this.handleSelected}
                                    onClick={this.handleClick}
                                />
                            );
                        })
                    }
                </div>
            );
        }

        return (
            <div className="drop-down" style={style} />
        );
    }
}

CategorySelector.propTypes = {
    owner: PropTypes.shape(),
    visible: PropTypes.bool.isRequired,
    left: PropTypes.number,
    top: PropTypes.number,
    width: PropTypes.number,
    height: PropTypes.number,
    onCancel: PropTypes.func,
    onSelect: PropTypes.func,
};

CategorySelector.defaultProps = {
    owner: null,
    left: null,
    top: null,
    width: null,
    height: null,
    onCancel: null,
    onSelect: null,
};

const selectorRef = React.createRef();

function createSelector(props) {
    ReactDOM.render(React.createElement(
        CategorySelector, { ref: selectorRef, ...props }, null,
    ),
    document.querySelector('#hidden'));
}

function closeSelector() {
    ReactDOM.render(React.createElement(
        CategorySelector, {
            ref: selectorRef,
            visible: false,
            owner: null,
        },
        null,
    ),
    document.querySelector('#hidden'));
}

createSelector({ visible: false });

export default CategorySelector;
export { createSelector, closeSelector, selectorRef };
