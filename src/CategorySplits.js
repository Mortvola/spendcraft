import React, {useState} from 'react';
import PropTypes, { elementType } from 'prop-types';
import {CategoryInput, categorySelectList} from './CategoryInput'
import categoryList from './Categories'
import IconButton from './IconButton';
import AmountInput from './AmountInput';


function CategorySplitItem (props)  {

    const handleCategoryChange = (categoryId) => {
        // let category = categoryElement.data ();
        // amountInput.attr('data-cat-id', category.id);
        // let balance = categoryList.getBalance(category.id);
        
        // setTextElementAmount(catBalance, balance);
        
        // let amount = parseFloat(amountInput.val ());
        
        // if (from) {
        //     setTextElementAmount (newBalance, balance - amount);
        // }
        // else {
        //     setTextElementAmount (newBalance, balance + amount);
        // }
        props.onCategoryChange(props.split.id, categoryId);
    }
    
    const handleDeltaChange = (amount, delta) => {
        props.onDeltaChange(props.split.id, amount, delta);
    }
    
    const handleAddItem = () => {
        props.onAddItem(props.split.id);
    }

    const handleDeleteItem = () => {
        props.onDeleteItem(props.split.id);
    }

    let amount = 0;
    let categoryId = null;
    if (props.split) {
        amount = props.split.amount * props.neg;
        categoryId = props.split.categoryId;
    }
    
    return (
        <div className="transaction-split-item">
            <CategoryInput onChange={handleCategoryChange} categoryId={categoryId} />
            <div className="dollar-amount"/>
            <AmountInput onDeltaChange={handleDeltaChange} name="amount" amount={amount}/>
            <div className="dollar-amount"/>
            <IconButton icon="plus" onClick={handleAddItem} />
            <IconButton icon="minus" onClick={handleDeleteItem} />
        </div>
    );
}

CategorySplitItem.propTypes = {
    split: PropTypes.object,
    onAddItem: PropTypes.func.isRequired,
    onDeleteItem: PropTypes.func.isRequired,
    onDeltaChange: PropTypes.func.isRequired,
    onCategoryChange: PropTypes.func.isRequired,
    neg: PropTypes.number,
}

let nextId = -1;

function CategorySplits (props) {
    props.splits.forEach(element => {if (element.id === undefined) element.id = nextId--;})
    const [splits, setSplits] = useState(props.splits);
    let neg = props.total < 0 ? -1 : 1;

    const handleDeltaChange = (id, amount, delta) => {
        let split = splits.find((s) => s.id == id);

        if (split) {
            split.amount = amount;

            setSplits(splits.slice());
        }

        props.onChange(splits, -delta);
    }

    const handleCategoryChange = (id, categoryId) => {
        let split = splits.find((s) => s.id == id);

        if (split) {
            split.categoryId = categoryId;

            setSplits(splits.slice());
        }
    }
    
    const handleAddItem = (afterId) => {
        let index = splits.findIndex((s) => s.id == afterId);

        if (index != -1) {
            let sum = splits.reduce((accum, item) => accum + item.amount, 0);
            let amount = props.total - sum;

            let newSplits = splits.slice ();
            newSplits.splice(index + 1, 0, {id: nextId--, amount: amount});

            setSplits(newSplits);
            props.onChange(splits, -amount);
        }
    }

    const handleDeleteItem = (id) => {
        if (splits.length > 1) {
            let index = splits.findIndex((s) => s.id == id);

            if (index != -1) {
                let newSplits = splits.slice ();
                let amount = newSplits[index].amount;
                newSplits.splice(index, 1);

                setSplits(newSplits);
                props.onChange(splits, amount);
            }
        }
    }

    return (
        <div className="transaction-split-items">
            {splits.map ((s) =>
                <CategorySplitItem
                    key={s.id}
                    split={s}
                    neg={neg}
                    onAddItem={handleAddItem}
                    onDeleteItem={handleDeleteItem}
                    onDeltaChange={handleDeltaChange}
                    onCategoryChange={handleCategoryChange}
                />)
            }
        </div>
    );
}

CategorySplits.propTypes = {
    onChange: PropTypes.func.isRequired,
    from: PropTypes.bool,
    splits: PropTypes.array.isRequired,
    total: PropTypes.number.isRequired,
}

export default CategorySplits;
