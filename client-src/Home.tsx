import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import CategoryView from './CategoryView/CategoryView';
import { useGroupDialog } from './CategoryView/GroupDialog';
import { useFundingDialog } from './funding/FundingDialog';
import { useRebalanceDialog } from './rebalance/RebalanceDialog';
import DetailView from './DetailView';
import MobxStore from './state/mobxStore';

const Home = () => {
  const { uiState, categoryTree } = useContext(MobxStore);
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [GroupDialog, showGroupDialog] = useGroupDialog();

  useEffect(() => {
    if (uiState.selectedCategory) {
      uiState.selectedCategory.getTransactions();
    }
    // register.loadCategoryTransactions(uiState.selectedCategory);
  }, [uiState.selectedCategory]);

  if (categoryTree.initialized) {
    return (
      <>
        <div className="side-bar">
          <div className="categories">
            <div className="tools">
              <button type="button" id="add-group" className="button" onClick={showGroupDialog}>Add Group</button>
              <GroupDialog />
              <button type="button" id="fund-cats" className="button" onClick={showRebalanceDialog}>Rebalance</button>
              <RebalanceDialog />
              <button type="button" id="fund-cats" className="button" onClick={showFundingDialog}>Fund</button>
              <FundingDialog />
            </div>
            <CategoryView />
          </div>
        </div>
        <DetailView detailView="Transactions" />
      </>
    );
  }

  return null;
};

export default observer(Home);
