import React from 'react';
import { Calendar, SquarePen } from 'lucide-react';
import { useCategoryDialog } from './CategoryDialog';
import { CategoryInterface } from '../../State/Types';
import { CategoryType } from '../../../common/ResponseTypes';
import LucideButton from '../../LucideButton';
import styles from './CategoryView.module.scss';

interface PropsType {
  category: CategoryInterface,
}

const EditButton: React.FC<PropsType> = ({
  category,
}) => {
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();

  const showDialog = () => {
    switch (category.type) {
      case CategoryType.Regular:
        showCategoryDialog();
        break;
      case CategoryType.Bill:
        showCategoryDialog();
        break;
      default:
        showCategoryDialog();
        break;
    }
  }

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation()
  }

  return (
    <div onClick={handleClick}>
      <LucideButton className={styles.catButton} onClick={showDialog}>
        {
          category.useGoal
            ? <Calendar size={16} strokeWidth={2.5} color={category.type === CategoryType.Bill ? '#ff8f8f' : undefined} />
            : <SquarePen size={16} strokeWidth={2.5} />
        }
        
      </LucideButton>
      <CategoryDialog category={category} />
    </div>
  );
};

export default EditButton;
