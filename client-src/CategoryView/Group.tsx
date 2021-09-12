import React, { ReactElement } from 'react';
import { observer } from 'mobx-react-lite';
import Buttons from './Buttons';
import Category from './Category';
import StateGroup from '../State/Group';
import LoansGroup from '../State/LoansGroup';
import StateCategory from '../State/Category';
import { CategoryInterface } from '../State/State';

type Props = {
  group: StateGroup | LoansGroup,
  onCategorySelected: ((category: StateCategory) => void),
  selectedCategory?: CategoryInterface | null,
}

const Group = ({
  group,
  onCategorySelected,
  selectedCategory,
}: Props): ReactElement => (
  <div className="cat-list-group">
    <div className="group-element-bar">
      <div className="group-name">{group.name}</div>
      <Buttons group={group} />
    </div>
    {
      group.categories.map((category) => (
        <Category
          key={category.name}
          category={category}
          group={group}
          onCategorySelected={onCategorySelected}
          selected={selectedCategory === category}
        />
      ))
    }
  </div>
);

Group.defaultProps = {
  selectedCategory: null,
};

export default observer(Group);
