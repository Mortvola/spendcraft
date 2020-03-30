'use strict'

const querystring = require('querystring');

const Event = use('Event')
const Mail = use('Mail')
const Env = use('Env')

Event.on('user::created', async ({user, token}) => {

    let verificationLink = "http://192.168.1.28:3333/activate?" + querystring.encode({token: token});

    await Mail.send('emails.welcome', {verificationLink}, (message) => {
        message
          .to(user.email)
          .from(Env.get('MAIL_FROM_ADDRESS'))
          .subject('Verify Email Address');
    });
});
