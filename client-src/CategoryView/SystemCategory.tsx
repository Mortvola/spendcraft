import React, { ReactElement, useContext } from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../Amount';
import { CategoryInterface } from '../State/State';
import MobxStore from '../State/mobxStore';

type PropsType = {
  category: CategoryInterface | null,
  onCategorySelected?: () => void,
}

const SystemCategory = ({
  category,
  onCategorySelected,
}: PropsType): ReactElement | null => {
  const { uiState } = useContext(MobxStore);
  const handleClick = () => {
    if (category) {
      uiState.selectCategory(category);
      if (onCategorySelected) {
        onCategorySelected();
      }
    }
  };

  let className = 'cat-list-cat system';
  if (uiState.selectedCategory === category) {
    className += ' selected';
  }

  if (category) {
    return (
      <div className={className} onClick={handleClick}>
        <div className="cat-element-bar system">
          <div className="cat-list-name">{category.name}</div>
        </div>
        <Amount className="cat-list-amt" amount={category.balance} />
      </div>
    );
  }

  return null;
};

export default observer(SystemCategory);
