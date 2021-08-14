import React, { ReactElement, useContext } from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../Amount';
import { useCategoryTransferDialog } from '../CategoryTransferDialog';
import IconButton from '../IconButton';
import Category from '../state/Category';
import MobxStore from '../state/mobxStore';

type PropsType = {
  category: Category | null,
}

const SystemCategory = ({
  category,
}: PropsType): ReactElement | null => {
  const { uiState } = useContext(MobxStore);
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();
  const handleClick = () => {
    if (category) {
      uiState.selectCategory(category);
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
          <IconButton icon="random" onClick={showCategoryTransferDialog} />
          <div className="cat-list-name">{category.name}</div>
        </div>
        <Amount className="cat-list-amt" amount={category.balance} />
      </div>
    );
  }

  return null;
};

export default observer(SystemCategory);
