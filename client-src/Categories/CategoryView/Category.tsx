import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../../Amount';
import EditButton from './EditButton';
import { CategoryInterface, GroupInterface } from '../../State/Types';

type PropsType = {
  category: CategoryInterface,
  group: GroupInterface,
  selected: boolean,
  onCategorySelected: ((category: CategoryInterface) => void),
}

const Category: React.FC<PropsType> = observer(({
  category,
  group,
  selected,
  onCategorySelected,
}) => {
  const handleClick = () => {
    onCategorySelected(category);
  };

  let className = 'cat-list-cat';
  if (selected) {
    className += ' selected';
  }

  let barClassName = 'cat-element-bar';
  if (category.type !== 'LOAN' && category.type !== 'REGULAR') {
    barClassName += ' system';
  }

  return (
    <div className={className} onClick={handleClick}>
      <div className={barClassName}>
        {
          ['REGULAR', 'LOAN', 'BILL', 'GOAL'].includes(category.type)
            ? <EditButton category={category} />
            : null
        }
        <div className="cat-list-name">{category.name}</div>
      </div>
      <Amount className="cat-list-amt" amount={category.balance} />
    </div>
  );
});

export default Category;
