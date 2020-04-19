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


function openEditTransactionDialog (transaction, categoryId) {

    let neg = 1;
    if (transaction.amount < 0) {
        neg = -1;
    }
      
    let catSplits = new CategorySplits ($('#editTransactionForm .available-funds'), $('#editTransactionForm .transaction-split-items'), transaction.amount, transaction.categories, false, neg);
    
    $("#editTransactionDialog").modal ('show');
    
    $("#editTransactionForm").off('submit');
    $("#editTransactionForm").submit(function (event) {
        event.preventDefault();
          
        let request = {splits: catSplits.get () };
          
        updateTransactionCategory (transaction, request, categoryId);
        
        $("#editTransactionDialog").modal ('hide');
    });
}
  
export {openEditTransactionDialog, updateTransactionCategory};  
