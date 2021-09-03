import React, { useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import CategoryView from './CategoryView/CategoryView';
import DetailView from './DetailView';
import MobxStore from './state/mobxStore';

const Home = () => {
  const { uiState, categoryTree } = useContext(MobxStore);

  useEffect(() => {
    if (uiState.selectedCategory) {
      uiState.selectedCategory.getTransactions();
    }
    // register.loadCategoryTransactions(uiState.selectedCategory);
  }, [uiState.selectedCategory]);

  if (categoryTree.initialized) {
    return (
      <>
        <div className="side-bar window">
          <div className="categories">
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
