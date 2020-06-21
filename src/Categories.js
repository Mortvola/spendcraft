import 'regenerator-runtime/runtime';

class Categories {
    constructor() {
        this.getCategories();
    }

    getCategories() {
        fetch('/groups')
            .then(async (response) => {
                const json = await response.json();

                this.categories = json;

                // Find the system group and its categories
                this.systemGroup = this.categories.find((g) => g.system);
                this.unassigned = this.systemGroup.categories.find((c) => c.system && c.name === 'Unassigned');
                this.fundingPool = this.systemGroup.categories.find((c) => c.system && c.name === 'Funding Pool');

                $(document).trigger('category', [json]);
            });
    }

    getCategoryName(id) {
        let categoryName = null;

        this.categories.find((group) => {
            const category = group.categories.find((cat) => cat.id === id);

            if (category) {
                categoryName = `${group.name}:${category.name}`;
                return true;
            }

            return false;
        });

        return categoryName;
    }
}

const categoryList = new Categories();

export default categoryList;
