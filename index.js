const path = require('path');
const client = new (require('discord.js').Client)();
let {botToken, soundsPath} = require('./config.json');

if (!path.isAbsolute(soundsPath))
	soundsPath = path.join(__dirname, soundsPath);


 // load soundboard bot
require('./soundboard-plugin')(client, soundsPath);


client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});


client.login(botToken);
