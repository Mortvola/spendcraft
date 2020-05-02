import CategorySplits from './CategorySplits';


function catTransferDialog(id, date, categories) {
    const amount = 0;

    if (!date) {
        const now = new Date();

        const day = (`0${now.getDate()}`).slice(-2);
        const month = (`0${now.getMonth() + 1}`).slice(-2);

        date = `${now.getFullYear()}-${month}-${day}`;
    }

    const toCats = [];
    const fromCats = [];

    if (categories) {
        for (const cat of categories) {
            if (cat.amount >= 0) {
                toCats.push(cat);
            }
            else {
                fromCats.push(cat);
            }
        }
    }

    $("#catTransferForm [name='date']").val(date);

    const toCatSplits = new CategorySplits($('#catTransferForm .available-funds'), $('#catTransferForm .to-split-items'), amount, toCats, false);

    const fromCatSplits = new CategorySplits($('#catTransferForm .transfer-total'), $('#catTransferForm .from-split-items'), amount, fromCats, true, -1,
        (delta) => {
            toCatSplits.availableChanged(delta);
        });

    $('#catTransferForm .amount-input.transfer-amount')
        .attr('value', amount.toFixed(2))
        .attr('data-last-amount', amount)
        .val(amount)
        .change()
        .off('delta-change')
        .on('delta-change', (event, amount, delta) => {
            toCatSplits.availableChanged(delta);
        });

    $('#catTransferDialog').modal('show');

    $('#catTransferForm').off('submit');
    $('#catTransferForm').submit((event) => {
        event.preventDefault();

        const date = $("#catTransferForm [name='date']").val();
        const categories = fromCatSplits.get().concat(toCatSplits.get());

        if (id) {
            $.ajax({
                method: 'PATCH',
                url: `/category_transfer/${id}`,
                headers:
                {
                    'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
                },
                contentType: 'application/json',
                data: JSON.stringify({ date, categories }),
            })
                .done((response) => {
                    updateCategories(response);

                    $('#catTransferDialog').modal('hide');
                });
        }
        else {
            $.post({
                url: '/category_transfer',
                headers:
                {
                    'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
                },
                contentType: 'application/json',
                data: JSON.stringify({ date, categories }),
            })
                .done((response) => {
                    updateCategories(response);

                    $('#catTransferDialog').modal('hide');
                });
        }
    });
}

export default catTransferDialog;
