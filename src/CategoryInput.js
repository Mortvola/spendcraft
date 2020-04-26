import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import categoryList from './Categories'

class CategoryInput extends React.Component {
    constructor (props) {
        super(props);
        
        let categoryName = "";
        if (this.props.categoryId) { // && categoryList) {
            categoryName = categoryList.getCategoryName (this.props.categoryId);
        }
        
        this.state = {
                value: categoryName,
            }
        
        this.previousValue = this.state.value;
        
        this.inputRef = React.createRef ();
        
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
    
    openSelector () {
        
        if (this.inputRef.current) {
            let position = this.inputRef.current.getBoundingClientRect ();

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
    
    handleClick (event) {
        if (selectorRef.current) {
            
            if (selectorRef.current.getOwner() != this) {
                event.stopPropagation ();
                this.openSelector ();
            }
            else if (selectorRef.current.visible ()) {
                event.stopPropagation ();
            }
        }
    }
    
    handleSelect (group, category) {
        this.selection = {group: group, category: category};
        closeSelector ();
        this.setState({value: categoryList.getCategoryName (category.id)})
        
        if (this.props.onChange) {
            this.props.onChange(category.id);
        }
    }
    
    handleCancel () {
        closeSelector ();
        this.setState({value: this.previousValue});
    }
    
    handleChange (event) {
        this.setState({value: event.target.value});
        
        if (selectorRef.current) {
            selectorRef.current.setState({filter: event.target.value});
        }
    }
    
    handleBlur (event) {
        /*
        if (selectorRef.current.visible ()) {
            selectorRef.current.cancel ();
        }
        */
    }
    
    handleKeydown (event) {
        if (selectorRef.current.visible ()) {
            if (event.key == "Escape") {
                event.stopPropagation ();
                this.handleCancel ();
            }
            else if (event.key == "ArrowDown") {
                selectorRef.current.down ();
            }
            else if (event.key == "ArrowUp") {
                selectorRef.current.up ();
            }
            else if (event.key == "Enter") {
                selectorRef.current.enter ();
            }
            else if (event.key == "Tab") {
                selectorRef.current.enter ();
            }
        }
        else {
            if (event.key.length == 1 || event.key == "Backspace" || event.key == "Delete" ||
                event.key == "ArrowDown") {
                this.openSelector ();
            }
        }
    }
    
    render () {
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
                value={this.state.value}
            />
        );
    }
}


class CategorySelctorCategory extends React.Component {
    constructor (props) {
        super (props);
        
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleClick = this.handleClick.bind(this);
        
        this.ref = React.createRef ();
    }
    
    handleClick (event) {
        console.log("category.handleClick")
        event.stopPropagation ();
        this.props.onClick ();
    }
    
    handleMouseDown (event) {
        event.preventDefault ();
        event.stopPropagation ();
        this.props.onSelected(this.props.category);
    }
    
    componentDidUpdate () {
        if (this.props.selected && this.ref.current) {
            this.ref.current.scrollIntoView (false);
        }
    }
    
    render () {
        let className = 'cat-list-cat category-list-item category-select-item';
        
        if (this.props.selected) {
            className += ' selected';
            this.props.onSelected(this.props.category);
        }
        
        return (
            <div
                className={className}
                onMouseDown={this.handleMouseDown}
                onClick={this.handleClick}
                ref={this.ref}
            >
                {this.props.category.name}
            </div>);
    }
}

CategorySelctorCategory.propTypes = {
    onClick: PropTypes.func,
    onSelected: PropTypes.func,
    selected: PropTypes.bool,
    category: PropTypes.object,
}

class CategorySelectorGroup extends React.Component {
    constructor (props) {
        super (props);
        
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleClick = this.handleClick.bind(this);
        this.handleSelected = this.handleSelected.bind(this);
    }
    
    handleMouseDown (event) {
        event.preventDefault ();
    }
    
    handleClick (event) {
        event.stopPropagation ();
        console.log("handle click")
    }
    
    handleSelected (category) {
        this.props.onSelected (this.props.group, category);
    }
    
    filterCategories (categories, filter) {
        let result = [];
        
        if (filter !== "") {
            for (let c of categories) {
                if (c.name.toLowerCase ().includes(filter)) {
                    result.push(c);
                }
            }
        }
        else {
            // No filter. Allow all of the categories.
            result = categories;
        }
        
        return result;
    }

    filterGroup () {
        let categories = [];

        let parts = this.props.filter.toLowerCase().split(":");
        
        if (parts.length == 1) {
            // No colon. Filter can be applied to both group and categories.
            categories = this.filterCategories (this.props.group.categories, parts[0]);
        }
        else if (parts.length == 2) {
            // If the group contains the first part of the filter then
            // consider adding the categories
            if (parts[0] == "" || this.props.group.name.toLowerCase ().includes(parts[0])) {
                
                categories = this.filterCategories (this.props.group.categories, parts[1]);
            }
        }
        
        return categories;
    }
    
    render () {
        
        let categories = this.filterGroup ();
        
        if (categories.length > 0) {
            return (
                <div
                    className='category-list-item'
                    onMouseDown={this.handleMouseDown}
                    onClick={this.handleClick}
                >
                {this.props.group.name}
                {categories.map((c) => {
                    let selected = c.name == this.props.selected;
                    return <CategorySelctorCategory key={c.id} category={c} selected={selected} onSelected={this.handleSelected} onClick={this.props.onClick}/>;
                })}
                </div>);
        }
        
        return null;
    }
}


class CategorySelector extends React.Component {
    constructor (props) {
        super(props)
        
        console.log ("CategorySelector constructor called");
        
        this.state = {
            categories: categoryList.categories,
            filter: "",
            selected: {group: null, category: null}
        };
        
        this.selection = {};
        
        this.owner = null;
        this.listRef = React.createRef ();
        this.selectedRef = React.createRef ();
        
        this.handleSelected = this.handleSelected.bind(this);
        this.handleClick = this.handleClick.bind(this);
        
        $(document).on('category', (event, categories) => {
            this.setState({categories: categories})
        });

    }
    
    componentDidUpdate(prevProps) {
        // If we are changing from hidden to visible then 
        // reset state back to original
        if (!prevProps.visible && this.props.visible &&
            (this.state.filter != "" || this.state.selected.group != null || this.state.selected.category != null)) {
            this.setState({filter: "", selected: {group: null, category: null}});
        }
    }

    render () {
        
        let style = {display: "none"}
        
        if (this.props.visible) {
            style = {left: this.props.left, top: this.props.top, width: this.props.width, height: this.props.height};

            this.clickHandler = $(window).on('click.categorySelector', (event) => {
                console.log("Outside click");
                if (this.props.visible) { // && event.target != this.owner.inputRef) {
                    event.stopPropagation ();
                    this.props.onCancel ();
//                  this.cancel ();
//                    this.setState({visible: false})
                }
            });
        }
        else {
            $(window).off('click.categorySelector');
        }

        if (this.state.categories) {
            return (
                <div ref={this.listRef} className="drop-down" style={style}>
                {
                    this.state.categories.map ((g) => {
                        let selected = null;
                        if (this.state.selected.group == g.name) {
                            selected = this.state.selected.category;
                        }
                        return <CategorySelectorGroup key={g.id} group={g} selected={selected} filter={this.state.filter} onSelected={this.handleSelected} onClick={this.handleClick}/>
                    })
                }
                </div>
            );
        }
        
        return (
            <div className="drop-down" style={style}>
            </div>
        );
    }

    handleSelected (group, category) {
        console.log ('selected');
        this.selection.group = group;
        this.selection.category = category;
    }
    
    handleClick () {
        if (this.selection && this.selection.group && this.selection.category) {
            this.props.onSelect (this.selection.group, this.selection.category);
        }
    }
    
    getOwner () {
        return this.props.owner;
    }

//    show (owner) { //, callback) {
//        
//        this.setOwner (owner);
//        
//        //this.selectionCallback = callback;
//        
//        this.previousValue = $(this.owner).val ();
//        
//        $('#categoryDropDownList .category-list-item').show ();
//        $('#categoryDropDownList .cat-list-cat.selected').removeClass('selected');
//
//        // Determine how much space is below the owner. If there isn't enough space 
//        // for the drop down then display it above the owner.
//        let space = window.innerHeight - ($(owner).offset().top + $(owner).outerHeight ());
//        
//        if (space >= this.categoryDropDownList.outerHeight ()) {
//            this.categoryDropDownList.css('top', $(owner).offset().top + $(owner).outerHeight ());
//        }
//        else {
//            this.categoryDropDownList.css('top', $(owner).offset().top - this.categoryDropDownList.outerHeight ());
//        }
//
//        this.categoryDropDownList
//            .css ('left', $(owner).offset().left)
//            .css('width', $(owner).outerWidth ())
//            .show ();
//
//        $('#categoryDropDownList .category-list-item').first ().get (0).scrollIntoView (true);
//    }
    
    visible () {
        return this.props.visible;
    }
    
    hide () {
//        this.categoryDropDownList.hide ();
        this.setOwner (null);
    }
    
    cancel () {
        $(this.owner).val(this.previousValue);
        this.hide ();
    }
    
    setSelected (newSelected){
        
        let group = newSelected.parent().contents ().filter(function () { return this.nodeType == 3; }).text ();
        let category = newSelected.text ();
        
        this.setState({selected: {group: group, category: category}});
    }
    
    down () {
        
        if (this.listRef.current) {
            let selected = $(this.listRef.current).find('.cat-list-cat.selected');

            if (selected.length > 0) {
                let next = selected.next ();
                
                if (next.length > 0) {
                    this.setSelected (next);
                }
                else {
                    let next = selected.parent ().next ().children ().first ();
                    
                    if (next.length > 0) {
                        this.setSelected (next);
                    }
                }
            }
            else {
                selected = $(this.listRef.current).find('.cat-list-cat').first ().addClass('selected');
                this.setSelected(selected);
            }
        }
        
        return null;
    }
    
    up () {
        if (this.listRef.current) {
            let selected = $(this.listRef.current).find('.cat-list-cat.selected');
            
            if (selected.length > 0) {
                let prev = selected.prev ();
                
                if (prev.length > 0) {
                    this.setSelected (prev);
                }
                else {
                    let prev = selected.parent ().prev ().children ().last ();
    
                    if (prev.length > 0) {
                        this.setSelected (prev);
                    }
                }
            }
        }
    }
    
    enter () {
        this.handleClick ();
    }
}

let selectorRef = React.createRef ();

function createSelector (props) {
    console.log ("Calling createElement");
    props.ref = selectorRef;
    ReactDOM.render(React.createElement (
        CategorySelector, props, null),
        document.querySelector("#hidden"));
}

function closeSelector () {
    console.log ("Hiding selector");
    ReactDOM.render(React.createElement (
        CategorySelector, {
            ref: selectorRef,
            visible: false,
            owner: null},
        null),
        document.querySelector("#hidden"));
}

createSelector({visible: false});

export {CategoryInput, CategorySelector};
