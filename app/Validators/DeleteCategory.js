class DeleteCategory {
    get rules() {
        return {
            // validation rules
            catId: 'empty:transaction_categories,category_id',
        };
    }

    get data() {
        const requestBody = this.ctx.request.all();
        const { catId } = this.ctx.request.params;

        return { ...requestBody, catId };
    }
}

module.exports = DeleteCategory
