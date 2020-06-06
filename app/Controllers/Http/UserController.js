'use strict'

const querystring = require('querystring');

const Persona = use('Persona')
const Database = use('Database')

class UserController {

    async login ({ auth, request }) {
        const payload = request.only(['uid', 'password'])
        
        const user = await Persona.verify(payload)

        await auth.login(user);
        return '/home';
    }

    async logout ({auth, request, response}) {
        
        await auth.logout();
        response.redirect('/');
    }
    
    show ({ auth, params }) {
        if (auth.user.id !== Number(params.id)) {
          return "You cannot see someone else's profile"
        }
        return auth.user
    }

    static async get ({ auth }) {
        return { username: auth.user.username };
    }

    async register ({request}) {
        
        const payload = request.only(['username', 'email', 'password', 'password_confirmation'])
        
        const user = await Persona.register(payload)
    }

    async verifyEmail ({request, response}) {
        
        let params = request.get ();
        console.log(params);
        
        const user = await Persona.verifyEmail(params.token);
        
        // The emaiol has been verified. Complete setting up the account
        let groupId = await Database.insert({name: 'Unassigned', user_id: user.id, system: true}).into('groups').returning('id');
        
        await Database.insert ([
                {name: 'Funding Pool', system: true, group_id: groupId[0]},
                {name: 'Unassigned', system: true, group_id: groupId[0]},
                {name: 'Account Transfer', system: true, group_id: groupId[0]},
            ])
            .into('categories');
        
        response.redirect("/email_verified")
    }
}

module.exports = UserController
