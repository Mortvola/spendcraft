import React, { ReactElement } from 'react';
import { observer } from 'mobx-react-lite';
import Buttons from './GroupButtons';
import Category from './Category';
import { CategoryInterface, GroupInterface } from '../state/State';

type Props = {
  group: GroupInterface,
  onCategorySelected: ((category: CategoryInterface) => void),
  selectedCategory?: CategoryInterface | null,
}

const Group = ({
  group,
  onCategorySelected,
  selectedCategory,
}: Props): ReactElement => (
  <div className="cat-list-group">
    <div className="group-element-bar">
      <Buttons group={group} />
      <div className="group-name">{group.name}</div>
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
