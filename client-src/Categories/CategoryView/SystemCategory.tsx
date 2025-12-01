import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../../Amount';
import { CategoryInterface } from '../../State/Types';
import { useStores } from '../../State/Store';
import styles from './Category.module.scss';

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
        <div className={`${styles.catElementBar} ${styles.system}`}>
          <div className={styles.catListName}>{category.name}</div>
        </div>
        <Amount className={styles.catListAmt} amount={category.balance} />
      </div>
    );
  }

  return null;
});

export default SystemCategory;
