import React, { useState } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import CategoryInput from './CategoryInput/CategoryInput';
import IconButton from './IconButton';
import AmountInput from './AmountInput';
import Amount from './Amount';

function CategorySplitItem({
    split,
    balance,
    onCategoryChange,
    onDeltaChange,
    onAddItem,
    onDeleteItem,
    showBalances,
}) {
    const handleCategoryChange = (categoryId) => {
        onCategoryChange(split.id, categoryId);
    };

    const handleDeltaChange = (amount, delta) => {
        onDeltaChange(split.id, amount, delta);
    };

    const handleAddItem = () => {
        onAddItem(split.id);
    };

    const handleDeleteItem = () => {
        onDeleteItem(split.id);
    };

    const categoryId = split ? split.categoryId : null;
    const newBalance = balance === null ? null : balance - split.amount;

    const renderBalances = () => {
        if (showBalances) {
            return (
                <>
                    <Amount amount={balance} />
                    <Amount amount={newBalance} />
                </>
            );
        }

        return null;
    };

    let className = 'transaction-split-item';
    if (!showBalances) {
        className += ' no-balances';
    }

    return (
        <div className={className}>
            <CategoryInput onChange={handleCategoryChange} categoryId={categoryId} />
            <AmountInput onDeltaChange={handleDeltaChange} name="amount" amount={split.amount} />
            {renderBalances()}
            <IconButton icon="plus" onClick={handleAddItem} />
            <IconButton icon="minus" onClick={handleDeleteItem} />
        </div>
    );
}

CategorySplitItem.propTypes = {
    split: PropTypes.shape(),
    balance: PropTypes.number,
    onAddItem: PropTypes.func.isRequired,
    onDeleteItem: PropTypes.func.isRequired,
    onDeltaChange: PropTypes.func.isRequired,
    onCategoryChange: PropTypes.func.isRequired,
    showBalances: PropTypes.bool.isRequired,
};

CategorySplitItem.defaultProps = {
    split: null,
    balance: null,
};

const mapStateToProps = (state) => ({
    groups: state.categoryTree.groups,
});

let nextId = -1;

const CategorySplits = ({
    splits,
    onChange,
    total,
    groups,
    showBalances,
}) => {
    const [editedSplits, setEditedSplits] = useState(splits.map((s) => {
        if (s.id === undefined) {
            const id = nextId;
            nextId -= 1;

            return {
                ...s,
                id,
            };
        }

        return s;
    }));

    const handleDeltaChange = (id, amount, delta) => {
        const splitIndex = editedSplits.findIndex((s) => s.id === id);

        if (splitIndex !== -1) {
            const newSplits = [
                ...editedSplits.slice(0, splitIndex),
                { ...editedSplits[splitIndex], amount },
                ...editedSplits.slice(splitIndex + 1),
            ];

            setEditedSplits(newSplits);
            onChange(newSplits, -delta);
        }
    };

    const handleCategoryChange = (id, categoryId) => {
        const splitIndex = editedSplits.findIndex((s) => s.id === id);

        if (splitIndex !== -1) {
            const newSplits = [
                ...editedSplits.slice(0, splitIndex),
                { ...editedSplits[splitIndex], categoryId },
                ...editedSplits.slice(splitIndex + 1),
            ];

            setEditedSplits(newSplits);
            onChange(newSplits, 0);
        }
    };

    const handleAddItem = (afterId) => {
        const index = editedSplits.findIndex((s) => s.id === afterId);

        if (index !== -1) {
            const sum = editedSplits.reduce((accum, item) => accum + item.amount, 0);
            const amount = total - sum;

            const newSplits = editedSplits.slice();
            newSplits.splice(index + 1, 0, { id: nextId, amount });
            nextId -= 1;

            setEditedSplits(newSplits);
            onChange(newSplits, -amount);
        }
    };

    const handleDeleteItem = (id) => {
        if (editedSplits.length > 1) {
            const index = editedSplits.findIndex((s) => s.id === id);

            if (index !== -1) {
                const newSplits = editedSplits.slice();
                const { amount } = newSplits[index];
                newSplits.splice(index, 1);

                setEditedSplits(newSplits);
                onChange(newSplits, amount);
            }
        }
    };

    const getCategoryBalance = (categoryId) => {
        let balance = null;

        groups.find((group) => {
            const category = group.categories.find((cat) => cat.id === categoryId);

            if (category) {
                balance = category.amount;
                return true;
            }

            return false;
        });

        return balance;
    };

    return (
        <div className="transaction-split-items">
            {editedSplits.map((s) => {
                const currentBalance = getCategoryBalance(s.categoryId);
                return (
                    <CategorySplitItem
                        key={s.id}
                        split={s}
                        balance={currentBalance}
                        onAddItem={handleAddItem}
                        onDeleteItem={handleDeleteItem}
                        onDeltaChange={handleDeltaChange}
                        onCategoryChange={handleCategoryChange}
                        showBalances={showBalances}
                    />
                );
            })}
        </div>
    );
};

CategorySplits.propTypes = {
    onChange: PropTypes.func.isRequired,
    splits: PropTypes.arrayOf(PropTypes.shape()).isRequired,
    total: PropTypes.number.isRequired,
    groups: PropTypes.arrayOf(PropTypes.shape()).isRequired,
    showBalances: PropTypes.bool,
};

CategorySplits.defaultProps = {
    showBalances: false,
};

export default connect(mapStateToProps)(CategorySplits);
