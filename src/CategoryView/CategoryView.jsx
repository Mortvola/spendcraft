import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { selectCategory } from '../redux/actions';
import Group from './Group';

const mapStateToProps = (state) => ({
  groups: state.categoryTree.groups,
  selectedCategory: state.selections.selectedCategoryId,
});

const CategoryView = ({
  selectedCategory,
  groups,
  dispatch,
}) => {
  const handleCategorySelected = (categoryId) => {
    dispatch(selectCategory(categoryId));
  };

  return (
    <div id="categories">
      {groups.map((group) => (
        <Group
          key={group.name}
          group={group}
          onCategorySelected={handleCategorySelected}
          categorySelected={selectedCategory}
        />
      ))}
    </div>
  );
};

CategoryView.propTypes = {
  groups: PropTypes.arrayOf(PropTypes.shape),
  selectedCategory: PropTypes.number,
  dispatch: PropTypes.func.isRequired,
};

CategoryView.defaultProps = {
  groups: [],
  selectedCategory: undefined,
};

export default connect(mapStateToProps)(CategoryView);
