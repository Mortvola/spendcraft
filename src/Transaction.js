import React from 'react';
import IconButton from './IconButton';
import {CategoryInput} from './CategoryInput';
import Amount from './Amount';
import {updateTransactionCategory} from './TransactionDialog';


function getTransactionAmountForCategory(transaction, categoryId) {
    let amount = transaction.amount;
    
    if (transaction.categories !== undefined && transaction.categories !== null &&
        categoryId !== undefined && categoryId !== null) {
        
        let index = transaction.categories.findIndex (c => c.categoryId == categoryId);
        if (index != -1) {
            amount = transaction.categories[index].amount;
        }
    }
    
    return amount;
}

class Transaction extends React.Component {
    constructor (props) {
        super (props);
        
        this.handleClick = this.handleClick.bind(this);
        this.handleEditClick = this.handleEditClick.bind(this);
        this.handleChange = this.handleChange.bind(this);
    }
    
    handleClick () {
        this.props.onClick(this.props.transaction.id)
    }
    
    handleEditClick () {
        this.props.onEditClick(this.props.transaction.id);
    }
    
    handleChange (categoryId) {

        let request = { splits: [] };
        
        request.splits.push({categoryId: categoryId, amount: this.props.transaction.amount });
        
        updateTransactionCategory (this.props.transaction, request);
    }
    
    renderCategoryButton () {
        let transaction = this.props.transaction;
        let category = "";
        
        if (transaction.categories) {
            if (transaction.categories.length > 1) {
                return <button className='split-button' onClick={this.handleEditClick}>Split</button>
            }
            
            category = transaction.categories[0].group + ':' + transaction.categories[0].category;
        }
        
        return <CategoryInput defaultValue={category} onChange={this.handleChange}/>
    }
    
    render () {
        let {transaction, amount, balance, selected} = this.props;
        
        let className = "transaction";
        if (selected) {
            className += " transaction-selected";
        }
        
        return (
            <div className={className} onClick={this.handleClick}>
                <IconButton icon='edit' onClick={this.handleEditClick}/>
                <div>{transaction.date}</div>
                <div className='transaction-field'>{transaction.name}</div>
                <div className='trans-cat-edit'>
                    {this.renderCategoryButton ()}
                    <IconButton icon='list-ul' onClick={this.handleEditClick} />
                </div>
                <Amount className='transaction-field amount currency' amount={amount} />
                <Amount className='transaction-field balance currency' amount={balance} />
                <div className='transaction-field'>{transaction.institute_name}</div>
                <div className='transaction-field'>{transaction.account_name}</div>
            </div>);
    }
}

export {Transaction, getTransactionAmountForCategory};
