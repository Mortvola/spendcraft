import React from 'react';
import { useCategoryDialog } from './CategoryDialog';
import IconButton from '../../IconButton';
import { CategoryInterface, GroupInterface } from '../../State/State';

type PropsType = {
  category: CategoryInterface,
  group: GroupInterface,
}

const EditButton: React.FC<PropsType> = ({
  category,
  group,
}) => {
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();

  return (
    <>
      <IconButton icon="edit" onClick={showCategoryDialog} />
      <CategoryDialog category={category} group={group} />
    </>
  );
};

export default EditButton;