import React, { ReactElement } from 'react';
import { useCategoryDialog } from './CategoryDialog';
import IconButton from '../IconButton';
import Group, { isGroup } from '../state/Group';
import Category, { isCategory } from '../state/Category';
import { isLoan } from '../state/Loan';
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

  if (!group.system) {
    return (
      <>
        {
          isCategory(category) && isGroup(group)
            ? (
              <>
                <IconButton icon="edit" onClick={showCategoryDialog} />
                <CategoryDialog category={category} group={group} />
              </>
            )
            : null
        }
        {
          isLoan(category) && isLoansGroup(group)
            ? (
              <>
                <IconButton icon="edit" onClick={showLoanDialog} />
                <LoanDialog category={category} group={group} />
              </>
            )
            : null
        }
      </>
    );
  }

  return null;
};

export default EditButton;
