console.log('Node version: ' + process.version);

if (process.argv.length != 4) {
    console.log('Two positional arguments required: <bot token> <sound files path>');
}
const botToken       = process.argv[2];
const soundFilesPath = process.argv[3];

const fs = require('fs');
const client = new (require('discord.js').Client)();

 // command message handler
client.on('message', msg => {

    if ( ['list', 'help', 'listcommands', 'sounds', 'listsounds'].includes(msg.content) ) {
        let soundList = fs.readdirSync(soundFilesPath).map(v => v.split('.')[0]).join(', ');
        let soundListChunks = soundList.match(/(.{1,1900}(\s|$))\s*/g);
        for (let it of soundListChunks) {
            msg.reply(it);
        }
    }
    
    if ( ['stop', 'skip'].includes(msg.content) ) {
        if (msg.guild.me.voice.connection && msg.guild.me.voice.connection.dispatcher) {
            console.log("stopping")
            msg.guild.me.voice.connection.dispatcher.pause();
        }
    }

    if ( ['bot pejt stran', 'bot odstran se', 'dc', 'leave'].includes(msg.content) ) {
        if (msg.guild.me.voice.channel) {
            msg.guild.me.voice.channel.leave();
        }
    }
});

 // soundboard message handler
client.on('message', msg => {
    // attempt to fetch soundName from message (to lowercase, remove non alphanumeric)
    let soundName = msg.content.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '');
    if (!soundName) return;


    // find sound file
    let soundFilePath = null;

    let pathBase = soundFilesPath + '/' + soundName;
    for (it of [pathBase, pathBase + '.ogg', pathBase + '.mp3']) {
        if (fs.existsSync(it)) {
            soundFilePath = it;
            break;
        }
    }

    if (msg.member && msg.member.voice.channel && soundFilePath) {
    console.log('attempting to play ' + soundFilePath);
        msg.member.voice.channel.join()
          .then(con => {
              const dispatcher = con.play(soundFilePath);
              dispatcher.on('start', _ => console.log('!start'));
              dispatcher.on('error', err => console.log);
          })
          .catch(console.error);
    }
});


client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});


client.login(botToken);
