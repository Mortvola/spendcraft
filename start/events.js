const querystring = require('querystring');

const Event = use('Event')
const Mail = use('Mail')
const Env = use('Env')

Event.on('user::created', async ({ user, token }) => {
    const verificationLink = `${Env.get('APP_URL')}/activate?${querystring.encode({ token })}`;

    await Mail.send('emails.welcome', { verificationLink }, (message) => {
        message
            .to(user.email)
            .from(Env.get('MAIL_FROM_ADDRESS'))
            .subject('Verify Email Address');
    });
});
