class Categories {
    constructor () {
        this.getCategories ();
    }

    getCategories ()
    {
        $.getJSON({
            url: "/groups"
        })
        .done ((response) => {
            this.categories = response;
           
            // Find the system group and its categories
            this.systemGroup = this.categories.find(g => g.system);
            this.unassigned = this.systemGroup.categories.find(c => c.system && c.name == "Unassigned");
            this.fundingPool = this.systemGroup.categories.find(c => c.system && c.name == "Funding Pool");
              
            $(document).trigger('category', [response]);
        });
    }
      
    getBalance (id) {
        
        for (let group of this.categories) {
            
            let category = group.categories.find ( (cat) => cat.id == id );
            
            if (category) {
                return parseFloat(category.amount);
            }
        }
    }
    
    getCategoryName (id) {
        for (let group of this.categories) {
            
            let category = group.categories.find ((cat) => cat.id == id);
            
            if (category) {
                return group.name + ":" + category.name;
            }
        }
    }
}
  
let categoryList = new Categories;

export default categoryList;

