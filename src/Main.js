import categoryList from './Categories';
import { setTextElementAmount } from './NumberFormat';

let linkHandlerCommonOptions = {};


function updateCategory(id, amount) {
    setTextElementAmount($(`#categories [data-cat="${id}"]`), amount);
}

function updateCategories(categories) {
    for (const category of categories) {
        updateCategory(category.id, category.amount);
    }
}


/*
  function setCategoryText (element, categories) {
      if (!categories) {
          element.val ('');
      }
      else {
          if (categories.length > 1) {
              element.val('Split');
          }
          else {
              element.val (categories[0].group + ':' + categories[0].category);
          }
      }
  }
  */

/*
  function highlightTransaction (t) {
      $('.transactions').children().removeClass('transaction-selected');
      t.addClass('transaction-selected');
  }
  */

/*
  function populateTransactions (balance, transactions, categoryId)
  {
      $('.transactions').empty ();
      register.transactions = [];

      for (let transaction of transactions) {

          let t = $('<div></div>')
              .addClass('transaction')
              .on('click', function () {
                  highlightTransaction (t);
              });

          createIconButton("edit", function () {

                  if (transaction.type == 0) {
                      openEditTransactionDialog (transaction);
                  }
                  else {
                      catTransferDialog (transaction.id, transaction.date, transaction.categories);
                  }
              })
              .appendTo(t);

          $('<div></div>')
              .text (transaction.date)
              .appendTo(t);

          $('<div></div>').text (transaction.name)
              .addClass('transaction-field')
              .appendTo(t);

          let catDiv = $('<div></div>')
              .addClass('trans-cat-edit')
              .appendTo(t);

          let splitButton = $('<button>Split</button>')
              .addClass('split-button')
              .on ('click',
                  function () {
                      if (transaction.type == 0) {
                          openEditTransactionDialog (transaction);
                      }
                      else {
                          catTransferDialog (transaction.id, transaction.date, transaction.categories);
                      }
                  })
              .appendTo (catDiv);

          let cat = createCategoryInputElement ()
              .on ('change', function (event) {
                  let category = $(this).data ();

                  let request = { splits: [] };

                  request.splits.push({categoryId: category.id, amount: transaction.amount });

                  updateTransactionCategory (transaction, request);
              })
              .addClass('category')
              .addClass('transaction-field')
              .on('click', function (event) {
                  event.stopPropagation ();

                  highlightTransaction (t);
              })
              .appendTo(catDiv);

          setCategoryText (cat, transaction.categories);

          createIconButton("list-ul",
              function () {
                  if (transaction.type == 0) {
                      openEditTransactionDialog (transaction);
                  }
                  else {
                      catTransferDialog (transaction.id, transaction.date, transaction.categories);
                  }
              })
              .appendTo(catDiv);

          if (transaction.categories && transaction.categories.length > 1) {
              splitButton.show ();
              cat.hide ();
          }
          else {
              splitButton.hide ();
              cat.show ();
          }

          let amount = transaction.amount;

          if (transaction.categories !== undefined && transaction.categories !== null &&
              categoryId !== undefined && categoryId !== null) {

              let index = transaction.categories.findIndex (c => c.categoryId == categoryId);
              if (index != -1) {
                  amount = transaction.categories[index].amount;
              }
          }

          let amountElement = $('<div></div>').addClass('transaction-field amount currency').appendTo(t);
          setTextElementAmount (amountElement, amount);

          if (balance !== undefined) {
              let balanceElement =$('<div></div>').addClass('transaction-field balance currency').appendTo(t);

              setTextElementAmount (balanceElement, balance);

              balance -= amount;
          }

          $('<div></div>').text (transaction.institute_name).addClass('transaction-field').appendTo(t);
          $('<div></div>').text (transaction.account_name).addClass('transaction-field').appendTo(t);

          t.appendTo('.transactions');

          register.transactions.push ({transaction: transaction, element: t});
      }
  }
  */


function populateAccountList(institutions) {
    $('#accounts').empty();

    for (const institution of institutions) {
        createInstitutionElement(institution).appendTo('#accounts');
    }
}

function getConnectedAccounts() {
    $.getJSON({
        url: '/connected_accounts',
    })
        .done((response) => {
            populateAccountList(response);
        });
}


function openAddCategoryDialog(groupId, systemGroup, groupElement) {
    $("#addCategoryDialog [name='delete']").css('visibility', 'hidden');
    $('#addCategoryDialog .modal-title').text('Add Category');
    $('#addCategoryDialog [name="name"]').val('');

    $("#addCategoryForm [name='error']").css('display', 'none');
    $("#addCategoryForm [name='error'] strong").text('');

    $('#addCategoryDialog').modal('show');

    $('#addCategoryForm').off('submit');
    $('#addCategoryForm').submit((event) => {
        event.preventDefault();

        $("#addCategoryForm [name='error']").css('display', 'none');
        $("#addCategoryForm [name='error'] strong").text('');

        const cat = $('#addCategoryForm').serializeArray();

        $.post({
            url: `/groups/${groupId}/categories`,
            headers:
              {
                  'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
              },
            contentType: 'application/json',
            data: JSON.stringify({ groupId, name: cat[0].value }),
        })
            .fail((jqXHR) => {
                if (jqXHR.responseJSON.errors) {
                    for (const error of jqXHR.responseJSON.errors) {
                        $("#addCategoryForm [name='error']").css('display', 'block');
                        $("#addCategoryForm [name='error'] strong").text(error.message);
                    }
                }
            })
            .done((response) => {
                let newCategoryElement = createCategoryTreeElement(response.id, groupId, systemGroup, response.name, response.amount, groupElement.find('.group-name'));

                const categoryElements = $(groupElement).children('.cat-list-cat');

                for (const categoryElement of categoryElements) {
                    const name = $(categoryElement).find('.cat-list-name').text();

                    const compare = name.localeCompare(response.name);

                    if (compare > 0) {
                        newCategoryElement.insertBefore(categoryElement);
                        newCategoryElement = null;
                        break;
                    }
                }

                if (newCategoryElement !== null) {
                    newCategoryElement.appendTo(groupElement);
                }

                $('#addCategoryDialog').modal('hide');
            });
    });
}

function openGroupDialog(groupId, groupElement) {
    $("#addGroupForm [name='error']").css('display', 'none');
    $("#addGroupForm [name='error'] strong").text('');

    if (groupElement) {
        $('#addGroupDialog .modal-title').text('Edit Group');

        $('#addGroupDialog [name="name"]').val(groupElement.find('.group-name').text());
        $("#addGroupDialog [name='delete']")
            .css('visibility', 'visible')
            .on('click', () => {
                $("#addGroupForm [name='error']").css('display', 'none');
                $("#addGroupForm [name='error'] strong").text('');

                $.ajax({
                    url: `/groups/${groupId}`,
                    headers:
                      {
                          'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
                      },
                    contentType: 'application/json',
                    method: 'DELETE',
                })
                    .fail((jqXHR) => {
                        if (jqXHR.responseJSON.errors) {
                            for (const error of jqXHR.responseJSON.errors) {
                                $("#addGroupForm [name='error']").css('display', 'block');
                                $("#addGroupForm [name='error'] strong").text(error.message);
                            }
                        }
                    })
                    .done((response) => {
                        $(groupElement).remove();
                        $('#addGroupDialog').modal('hide');
                    });
            });
    }
    else {
        $('#addGroupDialog .modal-title').text('Add Group');

        $('#addGroupDialog [name="name"]').val('');
        $("#addGroupDialog [name='delete']").css('visibility', 'hidden');
    }

    $('#addGroupDialog').modal('show');

    $('#addGroupForm').off('submit');
    $('#addGroupForm').submit((event) => {
        event.preventDefault();

        $("#addGroupForm [name='error']").css('display', 'none');
        $("#addGroupForm [name='error'] strong").text('');

        const group = $('#addGroupForm').serializeArray();

        if (groupId) {
            $.ajax({
                url: `/groups/${groupId}`,
                contentType: 'application/json',
                method: 'PATCH',
                data: JSON.stringify({ name: group[0].value }),
            })
                .fail((jqXHR) => {
                    if (jqXHR.responseJSON.errors) {
                        for (const error of jqXHR.responseJSON.errors) {
                            $("#addGroupForm [name='error']").css('display', 'block');
                            $("#addGroupForm [name='error'] strong").text(error.message);
                        }
                    }
                })
                .done((response) => {
                    $(groupElement).find('.group-name').text(response.name);
                    $('#addGroupDialog').modal('hide');
                });
        }
        else {
            $.post({
                url: '/groups',
                headers:
                  {
                      'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
                  },
                contentType: 'application/json',
                data: JSON.stringify({ name: group[0].value }),
            })
                .fail((jqXHR) => {
                    if (jqXHR.responseJSON.errors) {
                        for (const error of jqXHR.responseJSON.errors) {
                            $("#addGroupForm [name='error']").css('display', 'block');
                            $("#addGroupForm [name='error'] strong").text(error.message);
                        }
                    }
                })
                .done((response) => {
                    let newGroupElement = createGroupElement(response, true);

                    const groupElements = $('#categories > div');

                    for (const groupElement of groupElements) {
                        const name = $(groupElement).find('.group-name').text();

                        const compare = name.localeCompare(response.name);

                        if (compare > 0) {
                            newGroupElement.insertBefore(groupElement);
                            newGroupElement = null;
                            break;
                        }
                    }

                    if (newGroupElement !== null) {
                        newGroupElement.appendTo('#categories');
                    }

                    $('#addGroupDialog').modal('hide');
                });
        }
    });
}

function createCategoryFundingList(response, splits) {
    $('.cat-fund-items').empty();

    for (const group of response) {
        for (const category of group.categories) {
            if (category.system) {
                $('.available-funds').text(parseFloat(category.amount).toFixed(2));
            }
            else {
                const row = $('<div></div>').addClass('cat-fund-item');

                $('<div></div>').text(group.name).appendTo(row);
                $('<div></div>').text(category.name).appendTo(row);

                let value = '0.00';

                const found = splits.find((split) => split.categoryId === category.id);
                if (found) {
                    value = found.amount.toFixed(2);
                }

                const amount = $('<input></input>')
                    .attr('type', 'text')
                    .addClass('dollar-amount')
                    .attr('value', value)
                    .attr('data-init-value', value)
                    .attr('data-amount', value)
                    .attr('name', category.id)
                    .on('change', () => {
                        const newAmount = parseFloat(amount.val());
                        amount.val(newAmount.toFixed(2));

                        let previousAmount = parseFloat(amount.attr('data-amount'));

                        if (isNaN(previousAmount)) {
                            previousAmount = 0;
                        }

                        const newFundAmount = parseFloat($('.available-funds').text()) + previousAmount - newAmount;
                        $('.available-funds').text(newFundAmount.toFixed(2));

                        amount.attr('data-amount', newAmount.toFixed(2));
                    });

                if (found) {
                    amount.attr('data-id', found.id);
                }

                amount.appendTo(row);

                row.appendTo('.cat-fund-items');
            }
        }
    }
}

function objectifyNameValues(nameValues) {
    const returnObject = {};

    for (const i in nameValues) {
        returnObject[nameValues[i].name] = nameValues[i].value;
    }

    return returnObject;
}


function attachAmountInputElementMethods(element) {
    element
        .addClass('dollar-amount')
        .on('change', function () {
            let newAmount = parseFloat($(this).val().replace(/,/g, ''));

            if (isNaN(newAmount)) {
                newAmount = 0;
            }

            $(this).val(newAmount.toFixed(2));

            let previousAmount = parseFloat($(this).attr('data-last-amount'));

            if (isNaN(previousAmount)) {
                previousAmount = 0;
            }

            $(this).attr('data-last-amount', newAmount.toFixed(2));

            const delta = newAmount - previousAmount;

            $(this).trigger('delta-change', [newAmount, delta]);
        });
}


function createAmountInput(amount) {
    const element = $('<input></input>')
        .addClass('amount-input')
        .attr('type', 'text')
        .attr('value', amount.toFixed(2))
        .attr('data-last-amount', amount);

    attachAmountInputElementMethods(element);

    return element;
}


function openFundingDialog(plans, categories) {
    $("#addFundingDialog [name='plans']").empty();

    $('<option></option>')
        .text('None')
        .appendTo("#addFundingDialog [name='plans']");

    for (const plan of plans) {
        $('<option></option>')
            .text(plan.name)
            .val(plan.id)
            .appendTo("#addFundingDialog [name='plans']");
    }

    $("#addFundingDialog [name='plans']").on('change', () => {
        const selection = $("#addFundingDialog [name='plans']").val();

        if (selection === 'None') {
            $('.fund-list-item .fund-list-amt')
                .val(formatNumber('0.00'))
                .change();
        }
        else {
            $.getJSON({
                url: `/funding_plan/${selection}`,
            })
                .done((response) => {
                    for (const cat of response.categories) {
                        let amount = 0;
                        if (cat.amount !== undefined && cat.amount !== null) {
                            amount = parseFloat(cat.amount);
                        }

                        $(`.fund-list-item [data-cat-id='${cat.categoryId}'`)
                            .val(formatNumber(amount))
                            .change();
                    }
                });
        }
    });

    $('#addFundingForm .cat-fund-items').empty();

    for (const group of categories) {
        const groupElement = createGroupElement(group);

        for (const category of group.categories) {
            if (group.system) {
                if (category.system) {
                    $('.available-funds').text(parseFloat(category.amount).toFixed(2));
                }
            }
            else {
                const catElement = $('<div></div>')
                    .addClass('fund-list-item');

                const catNameElement = $('<div></div>')
                    .text(category.name)
                    .addClass('fund-list-cat-name')
                    .appendTo(catElement);

                let currentAmt = parseFloat(category.amount);

                if (currentAmt === undefined || currentAmt === null || isNaN(currentAmt)) {
                    currentAmt = 0;
                }

                const currentElement = $('<div></div>')
                    .addClass('fund-list-amt')
                    .attr('data-cat', category.id)
                    .appendTo(catElement);

                setTextElementAmount(currentElement, currentAmt);

                const fundingAmt = 0;

                const balanceAmt = currentAmt + fundingAmt;

                const balanceElement = $('<div></div>')
                    .addClass('fund-list-amt')
                    .attr('data-cat', category.id);

                setTextElementAmount(balanceElement, balanceAmt);

                createAmountInput(fundingAmt)
                    .on('delta-change', (event, amount, delta) => {
                        addTextElementAmount($('#addFundingForm .available-funds'), -delta);
                        setTextElementAmount(balanceElement, currentAmt + amount);
                    })
                    .attr('data-cat-id', category.id)
                    .attr('data-init-value', fundingAmt)
                    .appendTo(catElement);

                balanceElement.appendTo(catElement);

                catElement.appendTo(groupElement);
            }
        }

        groupElement.appendTo('#addFundingForm .cat-fund-items');
    }

    $('#addFundingDialog').modal('show');

    $('addFundingForm').off('submit');
    $('#addFundingForm').submit((event) => {
        event.preventDefault();

        // Validate that the date is in the past.
        const start = $("#addFundingForm [name='startDate']").val();

        if (start && start !== '') {
            const parts = start.split('-');

            if (parts.length === 3) {
                const startDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0);
                const now = new Date();

                if (startDate > now) {
                    // todo: display an error
                    console.log(`${startDate.toString()}, ${now.toString()}`);
                }
                else {
                    // Get the categories

                    const cats = $('#addFundingForm .cat-fund-items .amount-input');

                    const transfers = { date: $("#addFundingForm [name='startDate']").val(), categories: [] };
                    let sum = 0;

                    for (const cat of cats) {
                        const id = parseInt($(cat).attr('data-cat-id'));
                        const amount = parseFloat($(cat).val());

                        if (amount != 0) {
                            const transfer = { categoryId: id, amount };

                            transfers.categories.push(transfer);

                            sum += amount;
                        }
                    }

                    transfers.categories.push({ categoryId: categoryList.fundingPool.id, amount: -sum });

                    $.post({
                        url: '/category_transfer',
                        headers:
                          {
                              'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
                          },
                        contentType: 'application/json',
                        data: JSON.stringify(transfers),
                    })
                        .done((response) => {
                            updateCategories(response);

                            $('#addFundingDialog').modal('hide');
                        });
                }
            }
        }
    });
}


function openFundCatsDialog(transaction, categories) {
    if (transaction.categories) {
        createCategoryFundingList(categories, transaction.categories);
    }

    if (transaction) {
        $('#editFundingForm [name="startDate"]').val(transaction.date);
    }

    $('#editFundingDialog').modal('show');

    $('#editFundingForm').off('submit');
    $('#editFundingForm').submit((event) => {
        event.preventDefault();

        // Validate that the date is in the past.
        const start = $("#editFundingForm [name='startDate']").val();

        if (start && start !== '') {
            const parts = start.split('-');

            if (parts.length === 3) {
                const startDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0);
                const now = new Date();

                if (startDate > now) {
                    console.log(`${startDate.toString()}, ${now.toString()}`);
                }
                else {
                    // Get the categories

                    const cats = $('#editFundingForm .cat-fund-items :input');

                    const transfers = { date: startDate, from: categoryList.fundingPool.id, to: [] };

                    for (const cat of cats) {
                        const initValue = parseFloat($(cat).attr('data-init-value'));
                        const id = parseInt($(cat).attr('data-id'));
                        const amount = parseFloat($(cat).val());

                        const delta = amount - initValue;

                        if (delta !== 0) {
                            const transfer = { categoryId: parseInt(cat.name), amount, delta };

                            if (id) {
                                transfer.id = id;
                            }

                            transfers.to.push(transfer);
                        }
                    }

                    if (transfers.to.length > 0) {
                        if (transaction) {
                            $.ajax({
                                url: `/category_transfer/${transaction.id}`,
                                contentType: 'application/json',
                                method: 'PATCH',
                                data: JSON.stringify(transfers),
                            })
                                .done((response) => {
                                    updateCategories(response);

                                    $('#editFundingDialog').modal('hide');
                                });
                        }
                        else {
                            $.post({
                                url: '/category_transfer',
                                contentType: 'application/json',
                                data: JSON.stringify(transfers),
                            })
                                .done((response) => {
                                    updateCategories(response);

                                    $('#editFundingDialog').modal('hide');
                                });
                        }
                    }
                    else {
                        $('#editFundingDialog').modal('hide');
                    }
                }
            }
        }
    });
}

function openAccountSelectionDialog(institutionId, accounts) {
    $('#accountSelectionForm').empty();

    for (const account of accounts) {
        const accountItem = $('<div></div>').addClass('account-select-item');

        $('<div></div>').text(account.official_name ? account.official_name : account.name)
            .addClass('account-name')
            .appendTo(accountItem);

        $('<div></div>')
            .addClass('account-type')
            .append($('<label></label>').text('Type: '))
            .append($('<div></div>').text(account.subtype))
            .appendTo(accountItem);

        $('<div></div>')
            .addClass('account-balance')
            .append($('<label></label>').text('Balance: '))
            .append($('<div></div>').text(formatNumber(account.balances.current)).addClass('currency'))
            .appendTo(accountItem);

        const selector = $('<select></select>').attr('name', 'tracking')
            .append($('<option></option>').text('None').attr('value', 'None'))
            .append($('<option></option>').text('Transactions').attr('value', 'Transactions'))
            .append($('<option></option>').text('Balance').attr('value', 'Balance'))
            .val('None');

        $('<div></div>')
            .addClass('track-selection')
            .append($('<label></label').text('Account Tracking '))
            .append(selector)
            .appendTo(accountItem);

        account.selector = selector;

        accountItem.appendTo('#accountSelectionForm');
    }

    $('#accountSelectionDialog').modal('show');

    $('#accountSelectionForm').off('submit');
    $('#accountSelectionForm').submit((event) => {
        event.preventDefault();

        const newAccounts = { accounts: [] };

        for (const account of accounts) {
            const selection = $(account.selector).val();

            if (selection !== 'None') {
                account.tracking = selection;

                newAccounts.accounts.push(account);
            }
        }

        $('#accountSelectionDialog').modal('hide');

        $('#accountStartDialog').modal('show');

        $('#accountStartForm').off('submit');
        $('#accountStartForm').submit((event) => {
            event.preventDefault();

            const startDate = $('#accountStartForm').serializeArray();

            if (startDate.length > 0) {
                newAccounts.startDate = startDate[0].value;
            }

            $.post({
                url: `/institution/${institutionId}/accounts`,
                headers:
                  {
                      'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
                  },
                contentType: 'application/json',
                data: JSON.stringify(newAccounts),
                dataType: 'json',
            })
                .done((response) => {
                    populateAccountList(response.accounts);
                    updateCategories(response.categories);
                    $('#accountStartDialog').modal('hide');
                });
        });
    });
}


$().ready(() => {
    getConnectedAccounts();

    $('#add-group').on('click', () => {
        openGroupDialog();
    });
    $('#fund-cats').on('click', () => {
        $.getJSON({
            url: '/funding_plans',
        })
            .done((plans) => {
                $.getJSON({
                    url: '/groups',
                })
                    .done((categories) => {
                        openFundingDialog(plans, categories);
                    });
            });
    });

    $('.modal').on('shown.bs.modal', function () {
        $(this).find('input:first-of-type').trigger('focus');
    });

    //      attachCategoryInputElementMethods($("input.category-input"));

    attachAmountInputElementMethods($('input.amount-input'));
});

(function ($) {
    // Handles redirect from the oauth response page for the oauth flow.
    if (document.referrer != null && document.referrer.includes('http://localhost:8000/oauth-response.html')) {
        $('#container').fadeOut('fast', () => {
            $('#item_id').text('ITEM_ID');
            $('#access_token').text('ACCESS_TOKEN');
            $('#intro').hide();
            $('#app, #steps').fadeIn('slow');
        });
    }

    const products = plaidProducts.split(',');

    linkHandlerCommonOptions = {
        apiVersion: 'v2',
        clientName: appName,
        env: plaidEnvironment,
        product: products,
        key: plaidPublicKey,
        countryCodes: plaidCountryCodes.split(','),
    };

    const oauthRedirectUri = plaidRedirectUri;
    if (oauthRedirectUri != '') {
        linkHandlerCommonOptions.oauthRedirectUri = oauthRedirectUri;
    }

    const oauthNonce = plaidOauthNonce;
    if (oauthNonce != '') {
        linkHandlerCommonOptions.oauthNonce = oauthNonce;
    }

    // This functionality is only relevant for the UK Payment Initiation product.
    if (products.includes('payment_initiation')) {
        $('.payment_initiation').show();
        $.post('/set_payment_token', {}, (data) => {
            const { paymentToken } = data;
            $('#payment_token').text(paymentToken);

            // In the case of payment_initiation product, we need to wait for
            // payment token to be generated before the Link handler can be
            // initialized.
            handler = Plaid.create({
                ...linkHandlerCommonOptions,
                paymentToken,
                language: 'en',
                onSuccess(public_token) {
                    // This public token exchange step is not relevant for the
                    // payment_initiation product and should be skipped.
                    $.post('/get_access_token', {
                        public_token,
                    }, (data) => {
                        $('#container').fadeOut('fast', () => {
                            $('#item_id').text(data.item_id);
                            $('#access_token').text(data.access_token);
                            $('#intro').hide();
                            $('#app, #steps').fadeIn('slow');
                        });
                    });
                },
            });
            $('.add-acct').attr('disabled', false);
            $('.loading-indicator').hide();
        });
    }
    else {
        var handler = Plaid.create({
            ...linkHandlerCommonOptions,
            // webhook: 'https://your-domain.tld/plaid-webhook',
            onSuccess(public_token, metadata) {
                $.post({
                    url: '/institution',
                    headers:
                {
                    'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
                },
                    contentType: 'application/json',
                    data: JSON.stringify({ publicToken: public_token, institution: metadata.institution }),
                    dataType: 'json',
                })
                    .done((response) => {
                        let newInstitutionElement = createInstitutionElement({ id: response.id, name: response.name, accounts: [] });

                        const institutionElements = $('#accounts > div');

                        for (const institutionElement of institutionElements) {
                            const name = $(institutionElement).find('.institution-name').text();

                            const compare = name.localeCompare(response.name);

                            if (compare > 0) {
                                newInstitutionElement.insertBefore(institutionElement);
                                newInstitutionElement = null;
                                break;
                            }
                        }

                        if (newInstitutionElement !== null) {
                            newInstitutionElement.appendTo('#accounts');
                        }

                        openAccountSelectionDialog(response.id, response.accounts);
                    });
            },
        });

        $('.add-acct').attr('disabled', false);
        $('.loading-indicator').hide();
    }

    $('.add-acct').on('click', (e) => {
        handler.open();
    });
}(jQuery));
