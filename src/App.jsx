import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import CategoryView from './CategoryView';
import AccountView from './AccountView';
import { register } from './Register';
import categoryList from './Categories';

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
                        <button type="button" id="add-group" className="button">Add Group</button>
                        <button type="button" id="fund-cats" className="button">Fund</button>
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

const app = React.createElement(App, {}, null);
ReactDOM.render(app, document.querySelector('.main'));
