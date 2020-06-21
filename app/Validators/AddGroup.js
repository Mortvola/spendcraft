
class AddGroup {
    get rules() {
        const { id } = this.ctx.auth.user;

        return {
            // validation rules
            name: `required|uniqueWithin:groups,name,user_id,${id}`,
        };
    }
}

module.exports = AddGroup
