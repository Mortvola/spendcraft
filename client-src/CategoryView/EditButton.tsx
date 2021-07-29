import React, { ReactElement } from 'react';
import { useCategoryDialog } from './CategoryDialog';
import IconButton from '../IconButton';
import Group from '../state/Group';
import Category from '../state/Category';
import { useLoanDialog } from './LoanDialog';
import LoansGroup, { isLoansGroup } from '../state/LoansGroup';

type PropsType = {
  category: Category,
  group: Group | LoansGroup,
}
const EditButton = ({
  category,
  group,
}: PropsType): ReactElement | null => {
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();
  const [LoanDialog, showLoanDialog] = useLoanDialog();

  if (isLoansGroup(group)) {
    return (
      <>
        <IconButton icon="edit" onClick={showLoanDialog} />
        <LoanDialog category={category} group={group} />
      </>
    );
  }

  return (
    <>
      <IconButton icon="edit" onClick={showCategoryDialog} />
      <CategoryDialog category={category} group={group} />
    </>
  );
};

export default EditButton;
