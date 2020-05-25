import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Provider, connect } from 'react-redux';
import CategoryView from './CategoryView';
import AccountView from './AccountView';
import RegisterElement from './RegisterElement';
import categoryList from './Categories';
import { ModalLauncher } from './Modal';
import GroupDialog from './GroupDialog';
import FundingDialog from './FundingDialog';
import RebalanceDialog from './rebalance/RebalanceDialog';
import store from './redux/store';
import { fetchTransactions } from './redux/actions';

const App = connect()(({ dispatch }) => {
    const [accountSelected, setAccountSelected] = useState(null);
    const [categorySelected, setCategorySelected] = useState(
        categoryList.unassigned
            ? categoryList.unassigned.id
            : null,
    );

    const handleAccountSelected = (accountId) => {
        setAccountSelected(accountId);
        setCategorySelected(null);
        // register.viewAccount(accountId);
    };

    const handleCategorySelected = (categoryId) => {
        setCategorySelected(categoryId);
        setAccountSelected(null);
        dispatch(fetchTransactions(categoryId));
    };

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
                            launcher={(props) => (<button type="button" id="fund-cats" className="button" {...props}>Fund</button>)}
                            title="Fund Categories"
                            dialog={(props) => (<FundingDialog {...props} />)}
                        />
                        <ModalLauncher
                            launcher={(props) => (<button type="button" id="fund-cats" className="button" {...props}>Rebalance</button>)}
                            title="Rebalance Categories"
                            dialog={(props) => (<RebalanceDialog {...props} />)}
                        />
                    </div>
                    <CategoryView
                        onCategorySelected={handleCategorySelected}
                        categorySelected={categorySelected}
                    />
                </div>
                <div className="accounts">
                    <div className="account-bar">
                        <div>Institutions</div>
                        <div className="btn btn-sm group-button add-acct"><i className="fas fa-plus" /></div>
                    </div>
                    <AccountView
                        onAccountSelected={handleAccountSelected}
                        accountSelected={accountSelected}
                    />
                </div>
            </div>
            <RegisterElement />
        </>
    );
});

ReactDOM.render(
    <Provider store={store}>
        <App />
    </Provider>,
    document.querySelector('.main'),
);