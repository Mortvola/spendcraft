import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../../Amount';
import { CategoryInterface } from '../../State/Types';
import { useStores } from '../../State/Store';

interface PropsType {
  category: CategoryInterface | null,
  onCategorySelected: (category: CategoryInterface) => void,
}

const SystemCategory: React.FC<PropsType> = observer(({
  category,
  onCategorySelected,
}) => {
  const { uiState } = useStores();
  const handleClick = () => {
    if (category) {
      onCategorySelected(category);
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
});

export default SystemCategory;
