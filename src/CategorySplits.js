import {categorySelectList} from './CategoryInput'
import categoryList from './Categories'
import {setTextElementAmount, addTextElementAmount} from './NumberFormat'


function createIconButton (icon, callback) {
    return $("<div class='btn btn-sm'></div>")
        .html("<i class='fas fa-" + icon + "'></i>")
        .addClass('group-button')
        .on ('click', callback);
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
  
  function attachCategoryInputElementMethods (element) {

      element
          .attr('placeholder', 'Unassigned')
          .addClass('category-input')
          .on('blur',
              function (event) {
                  if (categorySelectList.visible ()) {
                          categorySelectList.cancel ();
                  }
              })
          .on('click',
              function (event) {
                  if (!categorySelectList.visible ()) {
                      event.stopPropagation ();
                      categorySelectList.show (this);
                  }
              })
          .on('input',
              function (event) {
                  categorySelectList.filter($(this).val());
              })
          .on('keydown',
              function (event) {
                  if (categorySelectList.visible ()) {
                      if (event.key == "Escape") {
                          event.stopPropagation ();
                          categorySelectList.cancel ();
                      }
                      else if (event.key == "ArrowDown") {
                          categorySelectList.down ();
                      }
                      else if (event.key == "ArrowUp") {
                          categorySelectList.up ();
                      }
                      else if (event.key == "Enter") {
                          categorySelectList.enter ();
                      }
                  }
                  else {
                      if (event.key.length == 1 || event.key == "Backspace" || event.key == "Delete" ||
                          event.key == "ArrowDown") {
                          categorySelectList.show (this);
                      }
                  }
              });
  }
  
  function createCategoryInputElement () {
      let element = $('<input></input>')
          .attr('type', 'input');
      
      attachCategoryInputElementMethods (element);

      return element;
  }

  class CategorySplits {
      
      constructor (totalElement, splitItems, total, categories, from, neg, totalChangedCallback) {
          this.neg = neg;
          if (this.neg !== 1 && this.neg !== -1) {
              this.neg = 1;
          }
          this.from = from;
          if (this.from == undefined) {
              this.from = true;
          }
          
          this.totalElement = totalElement;
          this.splitItems = splitItems;
          this.totalChangedCallback = totalChangedCallback;
          
          this.populateSplits(splitItems, total, categories)
      }
      
      availableChanged (delta) {
          addTextElementAmount (this.totalElement, delta);
      }
      
      populateSplits (splitItems, total, splits) {
          
          this.totalElement.off("delta-change").on ("delta-change", function (event, amout, delta) {
              addTextElementAmount (this, -delta);
          })
          
          setTextElementAmount (this.totalElement, this.neg * total);
          
          splitItems.empty ();
          
          if (splits !== null && splits !== undefined && splits.length > 0) {
              
              for (let split of splits) {
                  
                  this.createSplitItem (split).appendTo(splitItems);
              }
          }
          else {
              this.createSplitItem ().appendTo(splitItems);
          }
      }
      
      createSplitItem (split) {
          let splitItem = $('<div></div>').addClass('transaction-split-item');
          
          let categoryElement = createCategoryInputElement ()
              .on ('change', (event) => {
                  let category = categoryElement.data ();
                  amountInput.attr('data-cat-id', category.id);
                  let balance = categoryList.getBalance(category.id);
                  
                  setTextElementAmount(catBalance, balance);
                  
                  let amount = parseFloat(amountInput.val ());
                  
                  if (this.from) {
                      setTextElementAmount (newBalance, balance - amount);
                  }
                  else {
                      setTextElementAmount (newBalance, balance + amount);
                  }
              })
              .appendTo(splitItem);

          let catBalance = $("<div></div>").addClass('dollar-amount').appendTo(splitItem);
          
          let amountInput = createAmountInput (0)
              .on ("delta-change", (event, amout, delta) => {
                      if (!this.from) {
                          delta = -delta;
                      }
                      
                      addTextElementAmount(newBalance, -delta);
                      
                      this.availableChanged(delta);

                      if (this.totalChangedCallback) {
                          this.totalChangedCallback(delta);
                      }
                  })
              .attr('name', 'amount')
              .appendTo(splitItem);
          
          let newBalance = $("<div></div>").addClass('dollar-amount').appendTo(splitItem);
          
          createIconButton("plus", () => {
                  this.createSplitItem ().insertAfter(splitItem);
              })
              .appendTo(splitItem);

          createIconButton ("minus", () => {
                  if (!splitItem.is(":only-child")) {
                      let delta = amountInput.val ();
                      
                      if (this.from) {
                          delta = -delta;
                      }
                      
                      this.availableChanged(delta);

                      if (this.totalChangedCallback) {
                          this.totalChangedCallback(delta);
                      }

                      splitItem.remove ();
                  }
              })
              .appendTo(splitItem);

          if (split !== null && split != undefined) {
              categoryElement.val(split.group + ':' + split.category);

              amountInput
                  amountInput.attr('data-id', split.id)
                  .attr('data-cat-id', split.categoryId)
                  .val(this.neg * split.amount)
                  .change ();
          }

          return splitItem;
      }
      
      get () {
          let splits = [];
          
          let splitElements = this.splitItems.find("[name='amount']");
          
          for (let splitElement of splitElements) {
              
              let split = {categoryId: parseInt($(splitElement).attr('data-cat-id')), amount: this.neg * parseFloat($(splitElement).val ()) };
              
              let id = parseInt($(splitElement).attr('data-id'));
              
              if (!isNaN(id) && id !== null && id !== undefined) {
                  split.id = id;
              }
              
              splits.push(split);
          }
          
          return splits;
      }
  }
  
  
export default CategorySplits;
