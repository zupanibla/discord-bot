const client = new (require('discord.js').Client)();
const {botToken, soundsPath} = require('./config.json');


 // load soundboard bot
require('./soundboard-plugin')(client, soundsPath);


client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});


client.login(botToken);
