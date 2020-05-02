import React, {useState} from 'react';
import PropTypes from 'prop-types';
import {CategoryInput} from './CategoryInput'
import IconButton from './IconButton';
import AmountInput from './AmountInput';


function CategorySplitItem (props)  {

    const handleCategoryChange = (categoryId) => {
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

    let categoryId = props.split ? props.split.categoryId : null;
    
    return (
        <div className="transaction-split-item">
            <CategoryInput onChange={handleCategoryChange} categoryId={categoryId} />
            <div className="dollar-amount"/>
            <AmountInput onDeltaChange={handleDeltaChange} name="amount" amount={props.split.amount}/>
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
}

let nextId = -1;

function CategorySplits (props) {
    props.splits.forEach(element => {if (element.id === undefined) element.id = nextId--;})
    const [splits, setSplits] = useState(props.splits);

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
