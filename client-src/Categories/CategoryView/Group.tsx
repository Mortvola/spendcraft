import React from 'react';
import { observer } from 'mobx-react-lite';
import Buttons from './GroupButtons';
import Category from './Category';
import { CategoryInterface, GroupInterface } from '../../State/Types';
import { isCategory } from '../../State/Category';

type PropsType = {
  group: GroupInterface,
  onCategorySelected: ((category: CategoryInterface) => void),
  selectedCategory?: CategoryInterface | null,
  level?: number,
}

const Group: React.FC<PropsType> = observer(({
  group,
  onCategorySelected,
  selectedCategory = null,
  level = 0,
}) => (
  <>
    <div className="cat-list-group" style={{ marginLeft: 25 * level }}>
      <div className="group-element-bar">
        <Buttons group={group} />
        <div className="group-name">{group.name}</div>
      </div>
    </div>
    {
      group.children.map((category) => (
        isCategory(category)
          ? (
            <Category
              key={category.name}
              category={category}
              onCategorySelected={onCategorySelected}
              selectedCategory={selectedCategory}
              level={level + 1}
            />
          )
          : (
            <Group
              key={category.name}
              group={category as GroupInterface}
              onCategorySelected={onCategorySelected}
              selectedCategory={selectedCategory}
              level={level + 1}
            />
          )
      ))
    }
  </>
));

export default Group;
