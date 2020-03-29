const Event = use('Event')


Event.on('user::created', async ({user, token}) => {

    console.log ("New user created. Sending confirmation email to " + user.email + ", token: " + token);
    
    await Mail.send('emails.welcome', user.toJSON(), (message) => {
        message
          .to(user.email)
          .from(Env.get('MAIL_FROM_ADDRESS'))
          .subject('Welcome to debertas');
})
