'use strict'

const Persona = use('Persona')


class RegisterController {
    
    async register ({request}) {
        
        const payload = request.only(['username', 'email', 'password', 'password_confirmation'])
        
        const user = await Persona.register(payload)
    }
}

module.exports = RegisterController
