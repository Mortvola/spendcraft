import CategorySplits from './CategorySplits';


function catTransferDialog (id, date, categories) {
    
    let amount = 0;
    
    if (!date) {
        let now = new Date ();
          
        var day = ("0" + now.getDate()).slice(-2);
        var month = ("0" + (now.getMonth() + 1)).slice(-2);

        date = now.getFullYear() + "-" + (month) + "-" + (day) ;
    }

    let toCats = [];
    let fromCats = [];
      
    if (categories) {
        for (let cat of categories) {
            if (cat.amount >= 0) {
                toCats.push(cat);
            }
            else {
                fromCats.push(cat);
            }
        }
    }
      
    $("#catTransferForm [name='date']").val (date);

    let toCatSplits = new CategorySplits ($('#catTransferForm .available-funds'), $('#catTransferForm .to-split-items'), amount, toCats, false);

    let fromCatSplits = new CategorySplits ($('#catTransferForm .transfer-total'), $('#catTransferForm .from-split-items'), amount, fromCats, true, -1,
        (delta) => {
            toCatSplits.availableChanged(delta);
        });

    $("#catTransferForm .amount-input.transfer-amount")
        .attr('value', amount.toFixed(2))
        .attr('data-last-amount', amount)
        .val(amount)
        .change ()
        .off('delta-change')
        .on('delta-change', function (event, amount, delta) {
              
            toCatSplits.availableChanged (delta);
        });

    $("#catTransferDialog").modal ('show');

    $("#catTransferForm").off('submit');
    $("#catTransferForm").submit(function (event) {
        event.preventDefault();
          
        let date = $("#catTransferForm [name='date']").val ();
        let categories = fromCatSplits.get ().concat(toCatSplits.get ());
          
        if (id) {
            $.ajax({
                method: 'PATCH',
                url: "/category_transfer/" + id,
                headers:
                {
                    "X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr('content'),
                },
                contentType: "application/json",
                data: JSON.stringify({ date: date, categories: categories }),
            })
            .done (function(response)
            {
                updateCategories (response);

                $("#catTransferDialog").modal ('hide');
            });
        }
        else {
            $.post({
                url: "/category_transfer",
                headers:
                {
                    "X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr('content'),
                },
                contentType: "application/json",
                data: JSON.stringify({ date: date, categories: categories }),
            })
            .done (function(response)
            {
                updateCategories (response);

                $("#catTransferDialog").modal ('hide');
            });
        }
    });
}
  
export default  catTransferDialog;
