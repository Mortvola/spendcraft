import React from 'react';
import { useCategoryDialog } from './CategoryDialog';
import IconButton from '../../IconButton';
import { CategoryInterface, GroupInterface } from '../../State/State';
import { useBillDialog } from './BillDialog';

type PropsType = {
  category: CategoryInterface,
  group: GroupInterface,
}

const EditButton: React.FC<PropsType> = ({
  category,
  group,
}) => {
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();
  const [BillDialog, showBillDialog] = useBillDialog();

  const showDialog = () => {
    console.log(category.type)
    switch (category.type) {
      case 'REGULAR':
        showCategoryDialog();
        break;
      case 'BILL':
        showBillDialog();
        break;
      default:
        break;
    }
  }

  return (
    <>
      <IconButton icon="edit" onClick={showDialog} />
      <CategoryDialog category={category} group={group} />
      <BillDialog category={category} />
    </>
  );
};

export default EditButton;
