import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import CategoryView from './CategoryView';
import AccountView from './AccountView';
import { register } from './Register';
import categoryList from './Categories';
import { ModalLauncher } from './Modal';
import GroupDialog from './GroupDialog';
import FundingDialog from './FundingDialog';
import store from './redux/store';

function App() {
    const [accountSelected, setAccountSelected] = useState(null);
    const [categorySelected, setCategorySelected] = useState(
        categoryList.unassigned
            ? categoryList.unassigned.id
            : null,
    );

    const handleAccountSelected = (accountId) => {
        setAccountSelected(accountId);
        setCategorySelected(null);
        register.viewAccount(accountId);
    };

    const handleCategorySelected = (categoryId) => {
        setCategorySelected(categoryId);
        setAccountSelected(null);
        register.viewCategory(categoryId);
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
            <div className="register">
                <div className="register-title transaction">
                    <div />
                    <div>Date</div>
                    <div>Name</div>
                    <div>Category</div>
                    <div className="currency">Amount</div>
                    <div className="currency">Balance</div>
                    <div>Institution</div>
                    <div>Account</div>
                </div>
                <div className="transactions" />
            </div>
        </>
    );
}

ReactDOM.render(
    <Provider store={store}>
        <App />
    </Provider>,
    document.querySelector('.main'),
);
