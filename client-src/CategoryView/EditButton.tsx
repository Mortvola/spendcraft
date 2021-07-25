import React, { ReactElement } from 'react';
import { useCategoryDialog } from './CategoryDialog';
import IconButton from '../IconButton';
import Category from '../state/Category';
import Group from '../state/Group';

type PropsType = {
  category: Category,
  group: Group,
}
const EditButton = ({
  category,
  group,
}: PropsType): ReactElement | null => {
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();

  if (!group.system) {
    return (
      <>
        <IconButton icon="edit" onClick={showCategoryDialog} />
        <CategoryDialog category={category} group={group} />
      </>
    );
  }

  return null;
};

export default EditButton;
