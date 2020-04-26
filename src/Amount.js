import React from 'react';

function Amount (props) {
    
    let amount = props.amount;
    if (amount === undefined || amount === null) {
        amount = 0;
    }
    
    let className = props.className;
    
    if (amount < 0) {
        className += ' negative';
    }

    amount = parseFloat(amount).toFixed(2).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')

    return (<div className={className}>{amount}</div>);
}

export default Amount;
