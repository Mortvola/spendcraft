import React from 'react';
import PropTypes from 'prop-types';
import { observer } from 'mobx-react-lite';
import Buttons from './Buttons';
import Category from './Category';

const Group = ({
  group,
  onCategorySelected,
  categorySelected,
}) => (
  <div className="cat-list-group">
    <div className="group-element-bar">
      <div className="group-name">{group.name}</div>
      <Buttons group={group} />
    </div>
    {group.categories.map((category) => (
      <Category
        key={category.name}
        category={category}
        group={group}
        onCategorySelected={onCategorySelected}
        selected={categorySelected === category.id}
      />
    ))}
  </div>
);

Group.propTypes = {
  group: PropTypes.shape({
    categories: PropTypes.arrayOf(PropTypes.shape),
    system: PropTypes.bool,
    name: PropTypes.string.isRequired,
    id: PropTypes.number.isRequired,
  }),
  onCategorySelected: PropTypes.func.isRequired,
  categorySelected: PropTypes.number,
};

Group.defaultProps = {
  categorySelected: undefined,
  group: {
    categories: [],
    system: false,
  },
};

export default observer(Group);
