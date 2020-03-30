'use strict'

const querystring = require('querystring');

const Event = use('Event')
const Mail = use('Mail')
const Env = use('Env')

Event.on('user::created', async ({user, token}) => {

    console.log ("New user created. Sending confirmation email to " + user.email + ", token: " + token);
    
    token = querystring.encode({token: token});
    
    await Mail.send('emails.welcome', {user, token}, (message) => {
        message
          .to(user.email)
          .from(Env.get('MAIL_FROM_ADDRESS'))
          .subject('Welcome to debertas');
    });
});
