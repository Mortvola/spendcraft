import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import {Transaction, getTransactionAmountForCategory} from './Transaction';
import {openEditTransactionDialog} from './TransactionDialog';
import categoryList from './Categories';
import catTransferDialog from './CategoryTransferDialog';


class RegisterElement extends React.Component {
    constructor (props) {
        super (props);
        
        this.state = {
            selectedTransaction: null
        }
        
        this.handleClick = this.handleClick.bind(this);
        this.handleEditClick = this.handleEditClick.bind(this);
    }
    
    handleClick (transactionId) {
        this.setState({selectedTransaction: transactionId})
    }
    
    handleEditClick (transactionId) {
        this.props.onEdit(transactionId);
    }
    
    renderTransactions () {
        
        let list = [];
        let { transactions, balance, categoryId } = this.props;
        
        for (let transaction of transactions) {
            let amount = getTransactionAmountForCategory (transaction, categoryId)
            
            let selected = this.state.selectedTransaction == transaction.id;
            
            list.push(<Transaction
                key={transaction.id}
                transaction={transaction}
                amount={amount}
                balance={balance}
                categoryContext={categoryId}
                onClick={this.handleClick}
                selected={selected}
                onEditClick={this.handleEditClick}
            />);

            if (balance !== undefined) {
                balance -= amount;
            }
        }
        
        return list;
    }
    
    render () {
        return (
            <>
                {this.renderTransactions()}
            </>);
    }
}

RegisterElement.propTypes = {
    transactions: PropTypes.array.isRequired,
    balance: PropTypes.number.isRequired,
    categoryId: PropTypes.number,
    onEdit: PropTypes.func.isRequired,
}


class Register {
    
    constructor () {

        this.transactions = [];
        this.accountId = null;
        this.categoryId = null;
        
        $(document).on('accountRefreshed', () =>
        {
            if (this.accountId !== null) {
                this.viewAccount(this.accountId);
            }
            else if (this.categoryId !== null) {
                this.viewCategory(this.categoryId);
            }
        });
        
        $(document).on('transactionUpdated', (event) =>
        {
            let {transaction, delta} = event.detail;
            
            if (this.accountId !== null) {
                // If the transaction doesn't belong to the current account
                // then remove it from the view
            }
            else if (this.categoryId !== null) {
                // If the transaction doesn't belong to the current category
                // then remove it from the view
                
                if (this.categoryId === categoryList.unassigned.id) {
                    
                    // This is the Unassigned category. If there are categories assigned to 
                    // this transation then remove it.
                    
                    if (transaction.categories && transaction.categories.length > 0) {
                        this.removeTransaction (transaction.id);
                    }
                }
                else {
                    
                    // If there are no categories assigned to this transaction then remove it.
                    if (!transaction.categories || transaction.categories.length == 0) {
                        this.removeTransaction (transaction.id);
                    }
                    else {
                        
                        // If the current view's category can not be found in the transaction's
                        // categories then remove it.
                        let i = transaction.categories.findIndex (c => c.categoryId == this.categoryId);
                        if (i == -1) {
                            
                            this.removeTransaction(transaction.id);
                        }
                        else {
                            
                            this.balance += delta;
                            this.populateTransactions ();
                        }
                    }
                }
            }
        });
    }
    
    removeTransaction (transactionId) {
        let i = this.transactions.findIndex(t => t.id == transactionId);
        if (i !== -1) {
            let amount = getTransactionAmountForCategory (this.transactions[i], this.categoryId);
            
            this.balance -= amount;
            this.transactions.splice(i, 1);

            this.populateTransactions ();
        }
    }
    
    viewCategory (categoryId) {

        this.accountId = null;
        this.categoryId = categoryId;

        $.getJSON({
            url: "/category/" + categoryId + "/transactions",
            context: this
        })
        .done ( function (response) {
            this.transactions = response.transactions;
            this.balance = response.balance;
            this.sortTransactions ();
            this.populateTransactions ();
        });
    }
    
    viewAccount (accountId) {
        
        this.accountId = accountId;
        this.categoryId = null;
        
        $.getJSON({
            url: "/account/" + accountId + "/transactions",
            context: this
        })
        .done (function (response) {
            this.transactions = response.transactions;
            this.balance = response.balance;
            this.sortTransactions ();
            this.populateTransactions ();
        });
    }
    
    sortTransactions ()
    {
        // Sort the array 
        this.transactions.sort (function (a, b) {
            if (a.date < b.date) {
                return 1;
            }
            
            if (a.date > b.date) {
                return -1;
            }
            
            if (a.sort_order < b.sort_order) {
                return 1;
            }
            
            if (a.sort_order > b.sort_order) {
                return -1;
            }
            
            return 0;
        });
    }

    populateTransactions () {
        
        let register = React.createElement(
            RegisterElement,
            {
                transactions: this.transactions,
                balance: this.balance,
                categoryId: this.categoryId,
                onEdit: (transactionId) => {
                    let transaction = this.transactions.find((t) => t.id == transactionId);
                    
                    if (transaction) {
                        if (transaction.type == 0) {
                            openEditTransactionDialog (transaction, this.categoryId);
                        }
                        else {
                            catTransferDialog (transaction.id, transaction.date, transaction.categories);
                        }
                    }
                },
            },
            null);
        ReactDOM.render(register, document.querySelector(".transactions"));
    }
}

let register = new Register ();

export {RegisterElement, register};
