import React from 'react';
import styles from './DetailView.module.scss';
import LucideButton from './LucideButton';
import { Settings } from 'lucide-react';
import { useCategoryDialog } from './Categories/CategoryView/CategoryDialog';
import { useStores } from './State/Store';
import { CategoryType } from '../common/ResponseTypes';
import { useGroupDialog } from './Categories/CategoryView/GroupDialog';

interface PropsType {
  className?: string,
  title?: string,
  children?: React.ReactNode,
}

const DetailView: React.FC<PropsType> = ({
  className,
  title,
  children,
}) => {
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();
  const [GroupDialog, showGroupDialog] = useGroupDialog();
  const { uiState: { selectedCategory, selectedGroup } } = useStores()
  const showDialog = () => {
    if (selectedCategory !== null) {
      showCategoryDialog()
    }

    if (selectedGroup !== null) {
      showGroupDialog()
    }
  }

  return (
    <>
      <div className={`${styles.layout} ${className}`}>
        <div className={styles.titleLayout}>
          <div className={`${styles.mainTrayTitle} ellipsis`}>{title}</div>
          {
            (selectedCategory !== null && ![CategoryType.Unassigned, CategoryType.FundingPool, CategoryType.AccountTransfer].includes(selectedCategory.type))
            || selectedGroup !== null
              ? (
                <LucideButton onClick={showDialog}>
                  <Settings size={24} strokeWidth={2.5}  />
                </LucideButton>
              )
              : null
          }
        </div>
        {children}
      </div>
      <CategoryDialog category={selectedCategory} />
      {
        selectedGroup !== null
          ? <GroupDialog group={selectedGroup} />
          : null
      }
    </>
  )
};

export default DetailView;
