import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Provider, connect } from 'react-redux';
import { usePlaidLink } from 'react-plaid-link';
import CategoryView from './CategoryView';
import AccountView from './AccountView';
import RegisterElement from './RegisterElement';
import categoryList from './Categories';
import { ModalLauncher } from './Modal';
import GroupDialog from './GroupDialog';
import FundingDialog from './funding/FundingDialog';
import RebalanceDialog from './rebalance/RebalanceDialog';
import store from './redux/store';
import { fetchAccountTransactions, fetchCategoryTransactions } from './redux/actions';
import IconButton from './IconButton';
import { plaidConfig, onSuccess } from './Accounts';

const App = connect()(({ dispatch }) => {
    const [accountSelected, setAccountSelected] = useState(null);
    const [categorySelected, setCategorySelected] = useState(
        categoryList.unassigned
            ? categoryList.unassigned.id
            : null,
    );
    const { open, ready, error } = usePlaidLink({ ...plaidConfig, onSuccess });

    const handleAccountSelected = (accountId) => {
        setAccountSelected(accountId);
        setCategorySelected(null);
        dispatch(fetchAccountTransactions(accountId));
    };

    const handleCategorySelected = (categoryId) => {
        setCategorySelected(categoryId);
        setAccountSelected(null);
        dispatch(fetchCategoryTransactions(categoryId));
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
                            launcher={(props) => (<button type="button" id="fund-cats" className="button" {...props}>Rebalance</button>)}
                            dialog={(props) => (<RebalanceDialog {...props} />)}
                        />
                        <ModalLauncher
                            launcher={(props) => (<button type="button" id="fund-cats" className="button" {...props}>Fund</button>)}
                            dialog={(props) => (<FundingDialog {...props} />)}
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
                        <IconButton icon="plus" onClick={open} />
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
