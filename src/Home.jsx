import React from 'react';
import CategoryView from './CategoryView';
import { ModalLauncher } from './Modal';
import GroupDialog from './GroupDialog';
import FundingDialog from './funding/FundingDialog';
import RebalanceDialog from './rebalance/RebalanceDialog';
import DetailView from './DetailView';

const Home = () => (
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

export default Home;
