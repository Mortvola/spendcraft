import React, { ReactElement } from 'react';
import { observer } from 'mobx-react-lite';
import { useCategoryTransferDialog } from '../CategoryTransferDialog';
import Amount from '../Amount';
import IconButton from '../IconButton';
import EditButton from './EditButton';
import Group from '../state/Group';
import { GroupMemberInterface } from '../state/State';
import LoansGroup from '../state/LoansGroup';

type PropsType = {
  category: GroupMemberInterface,
  group: Group | LoansGroup,
  selected: boolean,
  onCategorySelected: ((id: number) => void),
}
const Category = ({
  category,
  group,
  selected,
  onCategorySelected,
}: PropsType): ReactElement => {
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();
  const handleClick = () => {
    onCategorySelected(category.id);
  };

  let className = 'cat-list-cat';
  if (selected) {
    className += ' selected';
  }

  let barClassName = 'cat-element-bar';
  if (group.system) {
    barClassName += ' system';
  }

  return (
    <div className={className} onClick={handleClick}>
      <div className={barClassName}>
        {
          !group.system
            ? <EditButton category={category} group={group} />
            : null
        }
        <IconButton icon="random" onClick={showCategoryTransferDialog} />
        <CategoryTransferDialog />
        <div className="cat-list-name">{category.name}</div>
      </div>
      <Amount className="cat-list-amt" amount={category.balance} />
    </div>
  );
};

export default observer(Category);
