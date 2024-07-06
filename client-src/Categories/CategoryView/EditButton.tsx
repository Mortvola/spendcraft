import React from 'react';
import { useCategoryDialog } from './CategoryDialog';
import IconButton from '../../IconButton';
import { CategoryInterface } from '../../State/Types';

type PropsType = {
  category: CategoryInterface,
}

const EditButton: React.FC<PropsType> = ({
  category,
}) => {
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();

  const showDialog = () => {
    switch (category.type) {
      case 'REGULAR':
        showCategoryDialog();
        break;
      case 'BILL':
        showCategoryDialog();
        break;
      default:
        showCategoryDialog();
        break;
    }
  }

  return (
    <>
      <IconButton icon="edit" onClick={showDialog} />
      <CategoryDialog category={category} />
    </>
  );
};

export default EditButton;
