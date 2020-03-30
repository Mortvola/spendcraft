'use strict'

const querystring = require('querystring');

const Persona = use('Persona')


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
    
    async register ({request}) {
        
        const payload = request.only(['username', 'email', 'password', 'password_confirmation'])
        
        const user = await Persona.register(payload)
    }

    async verifyEmail ({request, response}) {
        
        let params = request.get ();
        console.log(params);
        
        await Persona.verifyEmail(params.token);
        
        response.redirect("/email_verified")
    }
}

module.exports = UserController
