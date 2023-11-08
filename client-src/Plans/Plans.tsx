import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import PlanDetails from './PlanDetails';
import { useStores } from '../State/mobxStore';
import PlanList from './PlanList';
import Main from '../Main';
import useMediaQuery from '../MediaQuery'
import styles from './Plans.module.scss'
import { CategoryInterface } from '../State/State';
import { useEditCategoryDialog } from './EditCategoryDialog';
import FundingPlanCategory from '../State/FundingPlanCategory';

const Plans: React.FC = observer(() => {
  const { plans, uiState, categoryTree } = useStores();
  const [open, setOpen] = useState<boolean>(false);
  const { isMobile } = useMediaQuery();
  const [EditCategoryDialog, showEditCategoryDialog] = useEditCategoryDialog();
  const [category, setCategory] = useState<{
    category: CategoryInterface | undefined,
    planCategory: FundingPlanCategory | undefined,
  }>({
    category: undefined,
    planCategory: undefined,
  });
  const [initialized, setInitialized] = React.useState<boolean>(false);

  useEffect(() => {
    (async () => {
      if (!initialized && categoryTree.initialized) {
        setInitialized(true);
        await plans.load();
      }
    })()
  }, [initialized, plans, categoryTree.initialized, uiState.selectedPlan]);

  useEffect(() => {
    if (uiState.selectedPlan !== null) {
      plans.loadDetails(uiState.selectedPlan);
    }
  }, [plans, uiState.selectedPlan]);

  const handleEditCategory = (cat: CategoryInterface, planCategory: FundingPlanCategory) => {
    setCategory({ category: cat, planCategory });
    showEditCategoryDialog();
  }

  return (
    <div className={`${styles.layout} ${styles.theme}`}>
      <PlanDetails onEditCategory={handleEditCategory} />
      <EditCategoryDialog
        plan={uiState.selectedPlan}
        category={category.category}
        planCategory={category.planCategory}
      />
    </div>
  );
});

export default Plans;
