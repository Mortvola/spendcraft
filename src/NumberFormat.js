function getTextElementAmount(element) {
    return parseFloat(element.text().replace(/,/g, ''));
}

function formatNumber(num) {
    let number = num;
    if (number === undefined || number === null) {
        number = 0;
    }

    return parseFloat(number).toFixed(2).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
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

function addTextElementAmount(element, amount) {
    setTextElementAmount(element, getTextElementAmount(element) + parseFloat(amount));
}

export {
    setTextElementAmount, formatNumber, getTextElementAmount, addTextElementAmount,
};
