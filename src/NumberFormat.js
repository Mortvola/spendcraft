function getTextElementAmount(element) {
    return parseFloat(element.text().replace(/,/g, ''));
}


function addTextElementAmount(element, amount) {
    setTextElementAmount(element, getTextElementAmount(element) + parseFloat(amount));
}


function formatNumber(num) {
    if (num === undefined || num === null) {
        num = 0;
    }

    return parseFloat(num).toFixed(2).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
}


function setTextElementAmount(element, amount) {
    element.text(formatNumber(amount));

    if (amount < 0) {
        element.addClass('negative');
    }
    else {
        element.removeClass('negative');
    }
}


export {
    setTextElementAmount, formatNumber, getTextElementAmount, addTextElementAmount,
};
