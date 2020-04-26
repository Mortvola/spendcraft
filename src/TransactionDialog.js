import React, {useState} from 'react';
import PropTypes from 'prop-types';
import { Modal, Button } from 'react-bootstrap';
import {Field, withFormik} from 'formik';
import CategorySplits from './CategorySplits';
import {setTextElementAmount} from './NumberFormat'
import {getTransactionAmountForCategory} from './Transaction';

function updateCategory (id, amount) {
    setTextElementAmount($('#categories [data-cat="' + id + '"]'), amount);
}

function updateCategories (categories) {
    
    for (let category of categories) {
        updateCategory (category.id, category.amount);
    }
}

function updateTransactionCategory (transaction, request, categoryId) {
    let oldAmount = getTransactionAmountForCategory(transaction, categoryId);

    $.ajax({
        url: "/transaction/" + transaction.id,
        contentType: "application/json",
        method: 'PATCH',
        data: JSON.stringify(request),
    })
    .done (function (response) {
        updateCategories (response.categories);
        
        transaction.categories = response.splits;

        let newAmount;
        
        if (transaction.categories) {
            for (let c of transaction.categories) {
                c.amount = parseFloat(c.amount);
            }
            
            newAmount = getTransactionAmountForCategory(transaction, categoryId);
        }

        document.dispatchEvent(new CustomEvent('transactionUpdated', {detail: {transaction: transaction, delta: newAmount - oldAmount}}));
    });
}

function validateSplits (splits) {
    let error;

    if (splits !== undefined && splits.length > 0) {
        for (let split of splits) {
            if (split.categoryId == null || split.categoryId == undefined) {
                error = "There are one or more items not assigned a category.";
                break;
            }
        }
    }

    return error;
}

const TransactionForm = withFormik ({

    mapPropsToValues: (props) => ({
        splits: props.splits
            ? props.splits
            : [{amount: Math.abs(props.transaction.amount)}],
    }),

    validate: (values, props) => {
        const errors = {};
        let sum = values.splits.reduce((accum, item) => accum + item.amount, 0);

        console.log(JSON.stringify(values.splits));

        if (sum != Math.abs(props.transaction.amount)) {
            errors.splits = "The sum of the categories does not match the transaction amount."
        }

        return errors;
    },

    handleSubmit: (values, bag) => {
        updateTransactionCategory (bag.props.transaction, {splits: values.splits}, bag.props.categoryContext);
    }

})((props) => {
    let splits = props.values.splits;
    const [remaining, setRemaining] = useState(Math.abs(props.transaction.amount) - splits.reduce((accum, item) => accum + item.amount, 0));

    const handleTotalChange = (delta) => {
        setRemaining(prevRemaining => {
            let result = (parseFloat(prevRemaining) + delta).toFixed(2);
            if (result == "-0.00") {
                result = "0.00";
            }
            return result;
         });
    }

    const {
        handleSubmit,
        errors,
        touched,
    } = props;

    return (
        <form id="modalForm" onSubmit={handleSubmit}>
            <div className='cat-fund-table'>
                <div className='transaction-split-item cat-fund-title'>
                    <div className='fund-list-cat-name'>Category</div>
                    <div className='dollar-amount'>Balance</div>
                    <div className='dollar-amount'>Amount</div>
                    <div className='dollar-amount'>New Balance</div>
                </div>
                
                <Field name="splits" validate={validateSplits}>
                    {({ field: { value, name }, form: { setFieldValue } }) => (
                        <CategorySplits
                            splits={value}
                            total={props.transaction.amount}
                            from={props.from}
                            onChange={(splits, delta) => {
                                setFieldValue(name, splits);
                                handleTotalChange (delta);
                            }} />
                    )}
                </Field>
                {errors.splits && touched.splits && <div>{errors.splits}</div>}

                <div className='transaction-split-item'>
                    <div></div>
                    <div className='dollar-amount'>
                        <label>Unassigned</label>
                        <div className='available-funds splits-total dollar-amount'>{remaining}</div>
                    </div>
                </div>
            </div>
        </form>
    );
});

TransactionForm.propTypes = {
    splits: PropTypes.object,
    from: PropTypes.bool,
    transaction: PropTypes.object,
    categoryContext: PropTypes.number,
}

function TransactionDialog (props) {
    return (
        <Modal show={props.show} onHide={props.handleClose}>
            <Modal.Header closeButton>
                <Modal.Title>Edit Transaction</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <TransactionForm transaction={props.transaction} splits={props.splits} from={props.from} categoryContext={props.categoryContext}/>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={props.handleClose}>Cancel</Button>
                <Button variant="primary" type="submit" form="modalForm">Save</Button>
            </Modal.Footer>
        </Modal>
    );
}

TransactionDialog.propTypes = {
    show: PropTypes.bool.isRequired,
    handleClose: PropTypes.func.isRequired,
    splits: PropTypes.object,
    neg: PropTypes.bool,
    from: PropTypes.bool,
    transaction: PropTypes.object,
    categoryContext: PropTypes.number,
}

export {updateTransactionCategory, TransactionDialog};  
