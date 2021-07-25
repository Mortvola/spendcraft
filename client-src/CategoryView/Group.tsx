import React, { ReactElement } from 'react';
// import PropTypes from 'prop-types';
import { observer } from 'mobx-react-lite';
import Buttons from './Buttons';
import Category from './Category';
import StateGroup from '../state/Group';

type Props = {
  group: StateGroup,
  onCategorySelected: ((categoryId: number) => void),
  selectedCategoryId?: number | null,
}

const Group = ({
  group,
  onCategorySelected,
  selectedCategoryId,
}: Props): ReactElement => (
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
        selected={selectedCategoryId === category.id}
      />
    ))}
  </div>
);

Group.defaultProps = {
  selectedCategoryId: null,
};

export default observer(Group);
