# Subscribe to Kismet alerts via Websockets

This will subscribe to Kismet alerts via Websockets and send a custom email alert when it receives an alert from Kismet. The functionality is very basic, and it's just a starting point, but it works. Customize it to your needs.

## Configuration

Create `macmessagemappings.js`. You can use the included example file, or make your own based on the following:

**macmessagemappings.js**

```js
export const macMessageMappings = [
  {
    mac: "00:02:04:06:08:10",
    message: "Generic device",
  },
];
```

Modify `.env` to configure email settings. Use `.env.example` as a guide.

## Running

Run `npm install` to install dependencies.

Then run `npm start`.

You should see something like this:

```
> start
> nodemon kismetalerts.js

[nodemon] 3.1.10
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: js,mjs,cjs,json
[nodemon] starting `node kismetalerts.js`
[dotenv@17.2.2] injecting env (6) from .env -- tip: ⚙️  enable debug logging with { debug: true }
Opening websocket connection
{ SUBSCRIBE: 'ALERT' }
Alert timestamp: 10/10/2025, 12:00:00 PM
[]
Message sent: 250 2.0.0 OK: queued
```

The program will send an initial email indicating that the program is starting.
