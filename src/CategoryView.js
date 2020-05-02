import React from 'react';
import PropTypes from 'prop-types'
import catTransferDialog from './CategoryTransferDialog';
import {openEditCategoryDialog} from './CategoryDialog';
import categoryList from './Categories'
import IconButton from './IconButton'
import Amount from './Amount'

class CategoryView extends React.Component {
		
	constructor (props) {
		super(props);

		this.state = {
			categories: (categoryList ? (categoryList.categories ? categoryList.categories : []) : [] ),
		}

		$(document).on('category', (event, response) => {
			this.setState({categories: response});
		})
	}

	render () {
		return (
			<div id="categories">
				{this.state.categories.map ((group) =>
					<GroupElement
						key={group.name}
						group={group}
						onCategorySelected={this.props.onCategorySelected}
						categorySelected={this.props.categorySelected}
					/>
				)}
			</div>
		);
	}
}

CategoryView.propTypes = {
	onCategorySelected: PropTypes.func.isRequired,
	categorySelected: PropTypes.number,
}

function GroupElement (props) {

	const Buttons = (props) => {
		if (!props.group.system) {
			return (
				<>
					<IconButton icon="plus" onClick={() => openAddCategoryDialog (props.group.id, props.group.system, null)}/>
					<IconButton icon="edit" onClick={() => openGroupDialog (props.group.id, null)}/>
				</>
			);
		}

		return null;
	}

	return (
		<div className="cat-list-group">
			<div className="group-element-bar">
				<div className="group-name">{props.group.name}</div>
				<Buttons {...props}/>
			</div>
			{props.group.categories.map ((category) =>
				<CategoryElement
					key={category.name}
					category={category}
					systemGroup={props.group.system}
					onCategorySelected={props.onCategorySelected}
					selected={props.categorySelected == category.id}
				/>)
			}
		</div>
	);
}

GroupElement.propTypes = {
	group: PropTypes.object.isRequired,
	onCategorySelected: PropTypes.func.isRequired,
	categorySelected: PropTypes.number,
}
  

function CategoryElement (props) {// (id, groupId, systemGroup, name, amount)

	const handleClick = () => {
		props.onCategorySelected(props.category.id);
	}

	const EditButton = (props) => {
		if (!props.systemGroup) {
			return (
				<IconButton icon="edit" onClick={() => openEditCategoryDialog(props.category.groupId, props.category.id, null)} />
			);
		}

		return null;
	}

	let className = "cat-list-cat";
	if (props.selected) {
		className += " selected";
	}

	return (
		<div className={className} onClick={handleClick}>
			<div className="cat-element-bar">
				<EditButton {...props}/>
				<IconButton icon="random" onClick={catTransferDialog} />
				<div className="cat-list-name">{props.category.name}</div>
			</div>
			<Amount className="cat-list-amt" dataCat={props.category.id} amount={props.category.amount} />
		</div>
	);
}

CategoryElement.propTypes = {
	category: PropTypes.object.isRequired,
	systemGroup: PropTypes.bool.isRequired,
	onCategorySelected: PropTypes.func.isRequired,
	selected: PropTypes.bool.isRequired,
}

export default CategoryView;