import React, { useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import CategoryView from './CategoryView/CategoryView';
import { ModalLauncher } from './Modal';
import GroupDialog from './CategoryView/GroupDialog';
import FundingDialog from './funding/FundingDialog';
import RebalanceDialog from './rebalance/RebalanceDialog';
import DetailView from './DetailView';
import MobxStore from './state/mobxStore';

const Home = () => {
  const { uiState, register } = useContext(MobxStore);

  useEffect(() => {
    register.loadCategoryTransactions(uiState.selectedCategoryId);
  }, [uiState.selectedCategoryId, register]);

  return (
    <>
      <div className="side-bar">
        <div className="categories">
          <div className="tools">
            <ModalLauncher
              launcher={(props) => (<button type="button" id="add-group" className="button" {...props}>Add Group</button>)}
              title="Add Group"
              dialog={(props) => (<GroupDialog {...props} />)}
            />
            <ModalLauncher
              launcher={(props) => (<button type="button" id="fund-cats" className="button" {...props}>Rebalance</button>)}
              dialog={(props) => (<RebalanceDialog {...props} />)}
            />
            <ModalLauncher
              launcher={(props) => (<button type="button" id="fund-cats" className="button" {...props}>Fund</button>)}
              dialog={(props) => (<FundingDialog {...props} />)}
            />
          </div>
          <CategoryView />
        </div>
      </div>
      <DetailView detailView="Transactions" />
    </>
  );
};

export default observer(Home);
