# Gameverse server

Serves the Gameverse app and sends the password reset code to the user's Gmail.

## Run it on your computer
1. Install Node.js 20 or newer from nodejs.org.
2. Open a terminal in this folder and run: `npm install`
3. Get a Gmail App Password:
   - Google Account -> Security -> turn on 2-Step Verification
   - Google Account -> Security -> App passwords -> create one named "Gameverse" (16 characters)
4. Copy `.env.example` to `.env` and fill in `GMAIL_USER` and `GMAIL_APP_PASSWORD`.
5. Run: `npm start`
6. Open http://localhost:3000

Without a `.env` file the server still works: the code is printed in the terminal instead of emailed.

## Put it online
Any Node host works (Render, Railway, Fly.io, a VPS). Upload this folder, set the two environment
variables `GMAIL_USER` and `GMAIL_APP_PASSWORD`, and use `npm start` as the start command.

## Important
Accounts and passwords are still stored in each user's own browser (localStorage). The server only
creates, emails and checks the reset codes. For real users on different devices, accounts would also
need to move into a database on the server.
