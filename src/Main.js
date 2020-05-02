import React from 'react';
import ReactDOM from 'react-dom';
import {register} from './Register';
import categoryList from './Categories';
import {setTextElementAmount} from './NumberFormat'
import {CategoryView, createCategoryTreeElement} from './CategoryView'
import {createIconButton} from './IconButton'

var linkHandlerCommonOptions = {};


function updateCategory (id, amount) {
    setTextElementAmount($('#categories [data-cat="' + id + '"]'), amount);
}
  
function updateCategories (categories) {
      
    for (let category of categories) {
        updateCategory (category.id, category.amount);
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
  
  function createInstitutionElement (institution) {
      
      let institutionElement = $('<div></div>');
      
      let institutionBar = $('<div></div>')
          .addClass('acct-list-inst')
          .appendTo(institutionElement);
      
      $('<div></div>')
          .addClass('institution-name')
          .text(institution.name)
          .appendTo(institutionBar);
      
      createIconButton ("plus",
          function () {
              $.getJSON ({
                  url: '/institution/' + institution.id + '/accounts'
              })
              .done (function (response) {
                  
                  openAccountSelectionDialog (institution.id, response);
              });
          })
          .appendTo(institutionBar);
      
      createIconButton("lock", function () {
              $.getJSON ({
                  url: '/institution/' + institution.id + '/public_token'
              })
              .done (function (response) {
                  console.log(response);
                  
                   let handler = Plaid.create({
                          ...linkHandlerCommonOptions,
                          token: response.publicToken,
                          onSuccess: function(public_token, metadata) {},
                          onExit: function (err, metadata) {},
                      });
                   handler.open ();
              });
          })
          .appendTo(institutionBar);
      
      let accountsElement = $('<div></div>')
          .appendTo(institutionElement);
      
      for (let acct of institution.accounts) {
          
          let acctItem = $('<div></div>').addClass('acct-list-item');
          
          let refresh = $('<button><i class="fas fa-sync-alt"></i></button>')
              .on('click', function () {
                  
                  refresh.children("i").addClass('rotate');
                  
                  $.post ({
                      url: "/institution/" + institution.id + "/accounts/" + acct.id + "/transactions/sync", 
                      headers:
                      {
                          "X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr('content'),
                      },
                      contentType: "application/json"
                  })
                  .done (function (response) {
                      
                      if (response && response.categories && response.categories.length > 0) {
                          updateCategory (response.categories[0].id, response.categories[0].amount);
                      }
                      
                      document.dispatchEvent(new Event('accountRefreshed'));
                  })
                  .always (function () {
                      refresh.children("i").removeClass('rotate');
                  });
              });

          refresh.appendTo(acctItem);
          
          let account = $('<div></div>')
              .text(acct.name)
              .addClass('acct-list-acct')
              .on('click', function () {
                  $('#categories .cat-list-cat.selected').removeClass('selected');
                  $('#accounts .acct-list-acct.selected').removeClass('selected');
                  account.addClass('selected');
                  register.viewAccount (acct.id);
              });
          
          account.appendTo(acctItem);
          
          acctItem.appendTo(accountsElement);
      }
      
      return institutionElement;
  }

  
  function populateAccountList (institutions)
  {
      $('#accounts').empty ();
      
      for (let institution of institutions) {
          
          createInstitutionElement (institution).appendTo("#accounts");
      }
  }
  
  function getConnectedAccounts () {

      $.getJSON({
          url: "/connected_accounts"
      })
      .done (function(response) {
          populateAccountList (response);
      });
  }
  
  
  function openAddCategoryDialog (groupId, systemGroup, groupElement) {
      $("#addCategoryDialog [name='delete']").css('visibility', 'hidden');
      $('#addCategoryDialog .modal-title').text('Add Category');
      $('#addCategoryDialog [name="name"]').val('');

      $("#addCategoryForm [name='error']").css("display", "none");
      $("#addCategoryForm [name='error'] strong").text ("");

      $("#addCategoryDialog").modal ('show');

      $("#addCategoryForm").off('submit');
      $("#addCategoryForm").submit(function (event) {
          event.preventDefault();
          
          $("#addCategoryForm [name='error']").css("display", "none");
          $("#addCategoryForm [name='error'] strong").text ("");

          let cat = $('#addCategoryForm').serializeArray ();

          $.post({
              url: "/groups/" + groupId + "/categories",
              headers:
              {
                  "X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr('content'),
              },
              contentType: "application/json",
              data: JSON.stringify({ groupId: groupId, name: cat[0].value }),
          })
          .fail (function(jqXHR) {
              if (jqXHR.responseJSON.errors) {
                  
                  for (let error of jqXHR.responseJSON.errors) {
                      $("#addCategoryForm [name='error']").css("display", "block");
                      $("#addCategoryForm [name='error'] strong").text (error.message);
                  }
              }
          })
          .done (function(response) {
              let newCategoryElement = createCategoryTreeElement (response.id, groupId, systemGroup, response.name, response.amount, groupElement.find('.group-name'));
              
              let categoryElements = $(groupElement).children (".cat-list-cat");
              
              for (let categoryElement of categoryElements) {

                  let name = $(categoryElement).find('.cat-list-name').text ();
                  
                  let compare = name.localeCompare(response.name);
                  
                  if (compare > 0) {
                      
                      newCategoryElement.insertBefore(categoryElement);
                      newCategoryElement = null;
                      break;
                  }
              }
              
              if (newCategoryElement !== null) {
                  newCategoryElement.appendTo(groupElement);
              }

              $("#addCategoryDialog").modal ('hide');
          });
      });
  }
  
  function openGroupDialog(groupId, groupElement) {
      
      $("#addGroupForm [name='error']").css("display", "none");
      $("#addGroupForm [name='error'] strong").text ("");

      if (groupElement) {
          $('#addGroupDialog .modal-title').text('Edit Group');

          $('#addGroupDialog [name="name"]').val(groupElement.find('.group-name').text ());
          $("#addGroupDialog [name='delete']")
              .css('visibility', 'visible')
              .on('click', function () {
                  
                  $("#addGroupForm [name='error']").css("display", "none");
                  $("#addGroupForm [name='error'] strong").text ("");
                  
                  $.ajax ({
                      url: "/groups/" + groupId,
                      headers:
                      {
                          "X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr('content'),
                      },
                      contentType: "application/json",
                      method: 'DELETE'
                  })
                  .fail (function(jqXHR) {
                      if (jqXHR.responseJSON.errors) {
                          
                          for (let error of jqXHR.responseJSON.errors) {
                              $("#addGroupForm [name='error']").css("display", "block");
                              $("#addGroupForm [name='error'] strong").text (error.message);
                          }
                      }
                  })
                  .done (function(response) {
                      $(groupElement).remove ();
                      $("#addGroupDialog").modal ('hide');
                  });
              });
      }
      else {
          $('#addGroupDialog .modal-title').text('Add Group');
          
          $('#addGroupDialog [name="name"]').val("");
          $("#addGroupDialog [name='delete']").css('visibility', 'hidden')
      }

      $("#addGroupDialog").modal ('show');

      $("#addGroupForm").off('submit');
      $("#addGroupForm").submit(function (event) {
          event.preventDefault();
          
          $("#addGroupForm [name='error']").css("display", "none");
          $("#addGroupForm [name='error'] strong").text ("");

          let group = $('#addGroupForm').serializeArray ();

          if (groupId) {
              $.ajax ({
                  url: "/groups/" + groupId,
                  contentType: "application/json",
                  method: 'PATCH',
                  data: JSON.stringify({ name: group[0].value }),
              })
              .fail (function(jqXHR) {
                  if (jqXHR.responseJSON.errors) {
                      
                      for (let error of jqXHR.responseJSON.errors) {
                          $("#addGroupForm [name='error']").css("display", "block");
                          $("#addGroupForm [name='error'] strong").text (error.message);
                      }
                  }
              })
              .done (function(response)
              {
                  $(groupElement).find('.group-name').text(response.name);
                  $("#addGroupDialog").modal ('hide');
              });
          }
          else {
              $.post({
                  url: "/groups",
                  headers:
                  {
                      "X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr('content'),
                  },
                  contentType: "application/json",
                  data: JSON.stringify({ name: group[0].value }),
              })
              .fail (function(jqXHR) {
                  if (jqXHR.responseJSON.errors) {
                      
                      for (let error of jqXHR.responseJSON.errors) {
                          $("#addGroupForm [name='error']").css("display", "block");
                          $("#addGroupForm [name='error'] strong").text (error.message);
                      }
                  }
              })
              .done (function(response)
              {
                  let newGroupElement = createGroupElement (response, true);
                  
                  let groupElements = $("#categories > div");
                      
                  for (let groupElement of groupElements) {

                      let name = $(groupElement).find('.group-name').text ();
                      
                      let compare = name.localeCompare(response.name);
                      
                      if (compare > 0) {
                          
                          newGroupElement.insertBefore(groupElement);
                          newGroupElement = null;
                          break;
                      }
                  }
                  
                  if (newGroupElement !== null) {
                      newGroupElement.appendTo("#categories");
                  }
                  
                  $("#addGroupDialog").modal ('hide');
              });
          }
      });
  }

  function createCategoryFundingList (response, splits) {

      $('.cat-fund-items').empty ();
      
      for (let group of response) {
          
          for (let category of group.categories) {
              
              if (category.system) {
                  $('.available-funds').text(parseFloat(category.amount).toFixed(2));
              }
              else {
                  let row = $('<div></div>').addClass('cat-fund-item');
                  
                  $('<div></div>').text(group.name).appendTo(row);
                  $('<div></div>').text(category.name).appendTo(row);
                  
                  let value = '0.00';
                  
                  const found = splits.find(split => split.categoryId === category.id);
                  if (found) {
                      value = found.amount.toFixed(2);
                  }
                      
                  let amount = $('<input></input>')
                      .attr('type', 'text')
                      .addClass('dollar-amount')
                      .attr('value', value)
                      .attr('data-init-value', value)
                      .attr('data-amount', value)
                      .attr('name', category.id)
                      .on('change', function () {
                          let newAmount = parseFloat(amount.val());
                          amount.val(newAmount.toFixed(2));
                          
                          let previousAmount = parseFloat(amount.attr('data-amount'));
                          
                          if (isNaN(previousAmount)) {
                              previousAmount = 0;
                          }
                              
                          let newFundAmount = parseFloat($('.available-funds').text()) + previousAmount - newAmount;
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
  
  function objectifyNameValues(nameValues)
  {
      var returnObject = {};
      
      for (let i in nameValues)
      {
          returnObject[nameValues[i]['name']] = nameValues[i]['value'];
      }
      
      return returnObject;
  }


  function attachAmountInputElementMethods (element)
  {
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
    
              let delta = newAmount - previousAmount;
    
              $(this).trigger ("delta-change", [newAmount, delta])
          });
  }

  
  function createAmountInput (amount) {
      
      let element = $('<input></input>')
          .addClass('amount-input')
          .attr('type', 'text')
          .attr('value', amount.toFixed(2))
          .attr('data-last-amount', amount);
      
      attachAmountInputElementMethods (element);
      
      return element;
  }
  
  
  function openFundingDialog (plans, categories) {
      
      $("#addFundingDialog [name='plans']").empty ();
      
      $("<option></option>")
          .text ("None")
          .appendTo("#addFundingDialog [name='plans']");
      
      for (let plan of plans) {
          $("<option></option>")
              .text (plan.name)
              .val(plan.id)
              .appendTo("#addFundingDialog [name='plans']");
      }
          
      $("#addFundingDialog [name='plans']").on('change', function () {
          
          let selection = $("#addFundingDialog [name='plans']").val ();
          
          if (selection === "None") {
              $('.fund-list-item .fund-list-amt')
                  .val(formatNumber("0.00"))
                  .change ();
          }
          else {
              $.getJSON({
                  url: "/funding_plan/" + selection
              })
              .done (function (response) {
                  
                  for (let cat of response.categories) {
                      
                      let amount = 0;
                      if (cat.amount !== undefined && cat.amount !== null) {
                          amount = parseFloat(cat.amount);
                      }

                      $(".fund-list-item [data-cat-id='" + cat.categoryId + "'")
                          .val(formatNumber(amount))
                          .change ();
                  }
              });
          }
      });
      
      $('#addFundingForm .cat-fund-items').empty ();

      for (let group of categories) {
          
          let groupElement = createGroupElement (group);
          
          for (let category of group.categories) {
              
              if (group.system) {
                  
                  if (category.system) {
                      $('.available-funds').text(parseFloat(category.amount).toFixed(2));
                  }
              }
              else {
                  let catElement = $('<div></div>')
                      .addClass('fund-list-item');
              
                  let catNameElement = $('<div></div>')
                      .text(category.name)
                      .addClass('fund-list-cat-name')
                      .appendTo(catElement);
                  
                  let currentAmt = parseFloat(category.amount);
                  
                  if (currentAmt === undefined || currentAmt === null || isNaN(currentAmt)) {
                      currentAmt = 0;
                  }
                  
                  let currentElement = $('<div></div>')
                      .addClass('fund-list-amt')
                      .attr('data-cat', category.id)
                      .appendTo(catElement);
                      
                  setTextElementAmount (currentElement, currentAmt);
                  
                  let fundingAmt = 0;
                  
                  let balanceAmt = currentAmt + fundingAmt;
    
                  let balanceElement = $('<div></div>')
                      .addClass('fund-list-amt')
                      .attr('data-cat', category.id)

                  setTextElementAmount (balanceElement, balanceAmt);
    
                  createAmountInput (fundingAmt)
                      .on("delta-change", function (event, amount, delta) {
                          addTextElementAmount ($('#addFundingForm .available-funds'), -delta);
                          setTextElementAmount (balanceElement, currentAmt + amount);
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

      $("#addFundingDialog").modal ('show');

      $("addFundingForm").off('submit');
      $("#addFundingForm").submit(function (event) {
          event.preventDefault();
          
          // Validate that the date is in the past.
          let start = $("#addFundingForm [name='startDate']").val ();

          if (start && start !== "") {
              let parts = start.split("-");
              
              if (parts.length === 3) {
                  
                  let startDate = new Date (parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0);
                  let now = new Date ();
                  
                  if (startDate > now) {
                      //todo: display an error
                      console.log (startDate.toString () + ', ' + now.toString ());
                  }
                  else {
                      // Get the categories
                      
                      let cats = $("#addFundingForm .cat-fund-items .amount-input");

                      let transfers = { date: $("#addFundingForm [name='startDate']").val (), categories: [] };
                      let sum = 0;
                      
                      for (let cat of cats) {
                          
                          let id = parseInt($(cat).attr('data-cat-id'));
                          let amount = parseFloat($(cat).val ());
                          
                          if (amount != 0) {
                              let transfer = { categoryId: id, amount: amount };
                              
                              transfers.categories.push(transfer);
                              
                              sum += amount;
                          }
                      }
                      
                      transfers.categories.push({categoryId: categoryList.fundingPool.id, amount: -sum});

                      $.post({
                          url: "/category_transfer",
                          headers:
                          {
                              "X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr('content'),
                          },
                          contentType: "application/json",
                          data: JSON.stringify(transfers),
                      })
                      .done (function(response)
                      {
                          updateCategories (response);

                          $("#addFundingDialog").modal ('hide');
                      });
                  }
              }
          }
      });
  }
  
  
  function openFundCatsDialog(transaction, categories) {

      if (transaction.categories) {
          createCategoryFundingList (categories, transaction.categories);
      }

      if (transaction) {
          $('#editFundingForm [name="startDate"]').val(transaction.date);
      }

      $("#editFundingDialog").modal ('show');

      $("#editFundingForm").off('submit');
      $("#editFundingForm").submit(function (event) {
          event.preventDefault();
  
          // Validate that the date is in the past.
          let start = $("#editFundingForm [name='startDate']").val ();

          if (start && start !== "") {
              let parts = start.split("-");
              
              if (parts.length === 3) {
                  
                  let startDate = new Date (parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0);
                  let now = new Date ();
                  
                  if (startDate > now) {
                      console.log (startDate.toString () + ', ' + now.toString ());
                  }
                  else {
                      
                      // Get the categories
                      
                      let cats = $("#editFundingForm .cat-fund-items :input");

                      let transfers = { date: startDate, from: categoryList.fundingPool.id, to: [] };
                      
                      for (let cat of cats) {
                          
                          let initValue = parseFloat($(cat).attr('data-init-value'));
                          let id = parseInt($(cat).attr('data-id'));
                          let amount = parseFloat($(cat).val ());
                          
                          let delta = amount - initValue;
                          
                          if (delta !== 0) {
                              let transfer = { categoryId: parseInt(cat.name), amount: amount, delta: delta };
                              
                              if (id) {
                                  transfer.id = id;
                              }
                              
                              transfers.to.push(transfer);
                          }
                      }
                      
                      if (transfers.to.length > 0) {
                          if (transaction) {
                              $.ajax({
                                  url: "/category_transfer/" + transaction.id,
                                  contentType: "application/json",
                                  method: 'PATCH',
                                  data: JSON.stringify(transfers),
                              })
                              .done (function(response)
                              {
                                  updateCategories (response);

                                  $("#editFundingDialog").modal ('hide');
                              });
                          }
                          else {
                              $.post({
                                  url: "/category_transfer",
                                  contentType: "application/json",
                                  data: JSON.stringify(transfers),
                              })
                              .done (function(response)
                              {
                                  updateCategories (response);

                                  $("#editFundingDialog").modal ('hide');
                              });
                          }
                      }
                      else {
                          $("#editFundingDialog").modal ('hide');
                      }
                          
                  }
              }
          }
      });
  }

  function openAccountSelectionDialog (institutionId, accounts) {
      
      $("#accountSelectionForm").empty ();
      
      for (let account of accounts) {
          
          let accountItem = $("<div></div>").addClass('account-select-item');
          
          $("<div></div>").text(account.official_name ? account.official_name : account.name)
              .addClass('account-name')
              .appendTo(accountItem);
          
          $("<div></div>")
              .addClass('account-type')
              .append ($("<label></label>").text("Type: "))
              .append ($("<div></div>").text(account.subtype))
              .appendTo(accountItem);

          $("<div></div>")
              .addClass('account-balance')
              .append ($("<label></label>").text("Balance: "))
              .append ($("<div></div>").text(formatNumber(account.balances.current)).addClass('currency'))
              .appendTo(accountItem);

          let selector = $("<select></select>").attr("name", "tracking")
              .append($("<option></option>").text("None").attr("value", "None"))
              .append($("<option></option>").text("Transactions").attr("value", "Transactions"))
              .append($("<option></option>").text("Balance").attr("value", "Balance"))
              .val("None");
          
          $("<div></div>")
              .addClass('track-selection')
              .append ($("<label></label").text("Account Tracking "))
              .append (selector)
              .appendTo(accountItem);
          
          account.selector = selector;
          
          accountItem.appendTo ("#accountSelectionForm");
      }
      
      $("#accountSelectionDialog").modal ('show');

      $("#accountSelectionForm").off('submit');
      $("#accountSelectionForm").submit(function (event) {
          event.preventDefault();
          
          let newAccounts = { accounts: [] };
          
          for (let account of accounts) {
              
              let selection = $(account.selector).val ();
              
              if (selection !== "None") {
                  
                  account.tracking = selection;
                  
                  newAccounts.accounts.push (account);
              }
          }

          $("#accountSelectionDialog").modal ('hide');

          $("#accountStartDialog").modal ('show');

          $("#accountStartForm").off('submit');
          $("#accountStartForm").submit(function (event) {
              event.preventDefault();
              
              let startDate = $('#accountStartForm').serializeArray ();

              if (startDate.length > 0) {
                  newAccounts.startDate = startDate[0].value;
              }
              
              $.post ({
                  url: '/institution/' + institutionId + '/accounts',
                  headers:
                  {
                      "X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr('content'),
                  },
                  contentType: "application/json",
                  data: JSON.stringify(newAccounts),
                  dataType: "json"
              })
              .done (function(response) {
                  populateAccountList (response.accounts);
                  updateCategories(response.categories);
                  $("#accountStartDialog").modal ('hide');
              });
          });
      });
  }
  
  
  $().ready (function () {
      
      getConnectedAccounts ();
      
      let categoryView = React.createElement(CategoryView, {}, null);
      ReactDOM.render(categoryView, document.querySelector("#categories"));

      $('#add-group').on('click', function () { openGroupDialog (); });
      $('#fund-cats').on('click', function () {
          
          $.getJSON ({
              url: "/funding_plans"
          })
          .done (function (plans) {
              $.getJSON ({
                  url: "/groups"
              })
              .done (function (categories) {
                  openFundingDialog (plans, categories);
              });
          });
      });
      
      $('.modal').on('shown.bs.modal', function () {
          $(this).find('input:first-of-type').trigger('focus')
        })
        
//      attachCategoryInputElementMethods($("input.category-input"));
      
      attachAmountInputElementMethods ($("input.amount-input"));
  });
  
  (function($) {
    // Handles redirect from the oauth response page for the oauth flow.
    if (document.referrer != null && document.referrer.includes('http://localhost:8000/oauth-response.html')) {
      $('#container').fadeOut('fast', function() {
        $('#item_id').text('ITEM_ID');
        $('#access_token').text('ACCESS_TOKEN');
        $('#intro').hide();
        $('#app, #steps').fadeIn('slow');
      });
    }

    var products = plaidProducts.split(',');

    linkHandlerCommonOptions = {
      apiVersion: 'v2',
      clientName: appName,
      env: plaidEnvironment,
      product: products,
      key: plaidPublicKey,
      countryCodes: plaidCountryCodes.split(','),
    };
    
    var oauthRedirectUri = plaidRedirectUri;
    if (oauthRedirectUri != '') {
      linkHandlerCommonOptions.oauthRedirectUri = oauthRedirectUri;
    }
    
    var oauthNonce = plaidOauthNonce;
    if (oauthNonce != '') {
      linkHandlerCommonOptions.oauthNonce = oauthNonce;
    }
    
    // This functionality is only relevant for the UK Payment Initiation product.
    if (products.includes('payment_initiation')) {
      $('.payment_initiation').show();
      $.post('/set_payment_token', {}, function(data) {
        var paymentToken = data.paymentToken;
        $('#payment_token').text(paymentToken);

        // In the case of payment_initiation product, we need to wait for
        // payment token to be generated before the Link handler can be
        // initialized.
        handler = Plaid.create({
          ...linkHandlerCommonOptions,
          paymentToken: paymentToken,
          language: 'en',
          onSuccess: function(public_token) {
            // This public token exchange step is not relevant for the
            // payment_initiation product and should be skipped.
            $.post('/get_access_token', {
              public_token: public_token
            }, function(data) {
              $('#container').fadeOut('fast', function() {
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
        onSuccess:function(public_token, metadata) {
        
            $.post({
                url: '/institution',
                headers:
                {
                    "X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr('content'),
                },
                contentType: "application/json",
                data: JSON.stringify({ publicToken: public_token, institution: metadata.institution }),
                dataType: "json"
            })
            .done (function(response) {
                
                let newInstitutionElement = createInstitutionElement ({id: response.id, name: response.name, accounts: []})

                let institutionElements = $("#accounts > div");
                      
                for (let institutionElement of institutionElements) {

                    let name = $(institutionElement).find('.institution-name').text ();
                      
                    let compare = name.localeCompare(response.name);
                      
                    if (compare > 0) {
                          
                        newInstitutionElement.insertBefore(institutionElement);
                        newInstitutionElement = null;
                        break;
                    }
                }
                  
                if (newInstitutionElement !== null) {
                    newInstitutionElement.appendTo("#accounts");
                }

                openAccountSelectionDialog (response.id, response.accounts);
            });
        },
      });
                    
      $('.add-acct').attr('disabled', false);
      $('.loading-indicator').hide();
    }
    
    $('.add-acct').on('click', function(e) {
        handler.open();
      });

  })(jQuery);
