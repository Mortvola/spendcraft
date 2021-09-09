import React, { ReactElement } from 'react';
import { observer } from 'mobx-react-lite';
import { useCategoryTransferDialog } from '../CategoryTransferDialog';
import Amount from '../Amount';
import EditButton from './EditButton';
import LoansGroup from '../state/LoansGroup';
import { CategoryInterface, GroupInterface } from '../state/State';

type PropsType = {
  category: CategoryInterface,
  group: GroupInterface | LoansGroup,
  selected: boolean,
  onCategorySelected: ((category: CategoryInterface) => void),
}
const Category = ({
  category,
  group,
  selected,
  onCategorySelected,
}: PropsType): ReactElement => {
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();
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
          category.type === 'LOAN' || category.type === 'REGULAR'
            ? <EditButton category={category} group={group} />
            : null
        }
        <CategoryTransferDialog />
        <div className="cat-list-name">{category.name}</div>
      </div>
      <Amount className="cat-list-amt" amount={category.balance} />
    </div>
  );
};

export default observer(Category);
