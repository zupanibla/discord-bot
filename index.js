// log node version
console.log('Node version: ' + process.version);


// imports
const fs       = require('fs');
const path     = require('path');
const hound    = require('hound');


// args
if (process.argv.length != 4) {
    console.log('Two positional arguments required: <bot token> <sound files path>');
}
const botToken       = process.argv[2];
const soundFilesPath = process.argv[3];


// notifications are sent via the channels bellow
// they should at least update when a sound is played
let lastTextChannel  = null;
let lastVoiceChannel = null;

// list of soundboards: which reaction should trigger which sound on which message
// (soundName: string)[msgId: Snowflake][emojiName: string]
let soundboards = {};


// triggers a command if msg matches one
// returns true if message was a command, false otherwise
async function handleCommands(msg) {
    if ( ['list', 'help', 'listcommands', 'sounds', 'listsounds'].includes(msg.content) ) {
        // list sounds contained in the sound files directory (possibly in multiple messages)
        // TODO check how this behaves with duplicates (e.g. a.mp3, a.ogg)
        let soundList = fs.readdirSync(soundFilesPath).map(v => v.split('.')[0]).join(', ');
        let soundListChunks = soundList.match(/(.{1,1900}(\s|$))\s*/g);
        for (let it of soundListChunks) {
            msg.reply(it);
        }
    }
    
    else if ( ['stop', 'skip'].includes(msg.content) ) {
        // stop audio playback
        if (msg.guild && msg.guild.me && msg.guild.me.voice &&
            msg.guild.me.voice.connection && msg.guild.me.voice.connection.dispatcher) {
            console.log('stopping');
            msg.guild.me.voice.connection.dispatcher.pause();
        }
    }

    else if ( ['dc', 'leave', 'bot pejt stran', 'bot odstran se'].includes(msg.content) ) {
        // leave voice channel
        if (msg.guild && msg.guild.me && msg.guild.me.voice.channel) {
            msg.guild.me.voice.channel.leave();
        }
    }

    else if ( ['dclast', 'leavelast'].includes(msg.content) ) {
        // leave lastVoiceChannel
        if (lastVoiceChannel) {
            lastVoiceChannel.leave();
        }
    }

    else if ( msg.content.startsWith('echo ') ) {
        // send a message to lastTextChannel
        if (lastTextChannel) {
            lastTextChannel.send(msg.content.substring('echo '.length)).catch(console.error);
        }
    }

    else if ( ['listlatest', 'list latest'].includes(msg.content) ) {
        // replies with 10 latest files from 'soundFilesPath' and their creation dates
        // TODO creation date vs added to bot date
        let sortedFileList =
            fs.readdirSync(soundFilesPath)
            .map((it) => 
                ({
                    name: it,
                    time: new Date(fs.statSync(soundFilesPath + '/' + it).mtime.getTime()),
                })
            )
            .sort( (a, b) => b.time - a.time );
        
        [].slice()
        msg.reply(
            '\n' +
            sortedFileList
            .slice(0, 10)
            .map(it =>
                it.time.getFullYear() + '/' +
                String(it.time.getMonth() + 1).padStart(2, '0') + '/' +
                String(it.time.getDate()     ).padStart(2, '0') + ' ' +
                String(it.time.getHours()    ).padStart(2, ' ') + ':' +
                String(it.time.getMinutes()  ).padStart(2, '0') + ' ' +
                it.name
            )
            .join('\n')
        );
    }
    else if (msg.content.startsWith('makesoundboard ')) {
        // makes a soundboard - message with react buttons that trigger sounds
        // TODO somehow refresh soundboard when bot reconnects, staticly bound vc doesn't feel good
        let args = msg.content.substring('makesoundboard '.length).split(',');
        
        // TODO verify args (throws if emoji doesn't exist)
        // message should be: make soundboard <message>, (<sound>, <emoji> ),...

        let soundboardMessage = await msg.channel.send(args[0]);

        soundboards[soundboardMessage.id] = {};

        for (let i = 2; i < args.length; i += 2) {
            let soundName = args[i-1];
            let emoji = args[i].replace(/\s/g, '');

            // extract id if emoji is custom (e.g. "<:hikaru8:716765583915483159>")
            let match = emoji.match(/<:[^:]+:([0-9]+)>/);
            
            if (match) {
                emoji = match[1];
            }

            soundboards[soundboardMessage.id][emoji] = soundName;

            soundboardMessage.react(emoji);
        }
    }
    else return false;
    return true;
}


function playSound(voiceChannel, soundFilePath) {
    console.log('attempting to play ' + soundFilePath);
    voiceChannel.join()
      .then(con => {
          const dispatcher = con.play(soundFilePath);
          dispatcher.on('start', _ => console.log('started playing'));
          dispatcher.on('error', err => console.log);
      })
      .catch(console.error);
}

// tries to map text to a sound file from soundFilesPath and play it in voiceChannel
function attemptPlayingSoundFromText(text, voiceChannel) {
    // attempt to fetch soundName from message (to lowercase, remove non alphanumeric)
    let soundName = text.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '');
    if (!soundName) return false;

    // attempt to find the corresponding sound file
    let soundFilePath = null;

    for (it of [soundName, soundName + '.ogg', soundName + '.mp3']) {
        soundFilePathCandidate = path.join(soundFilesPath, it);
        if (fs.existsSync(soundFilePathCandidate)) {
            soundFilePath = soundFilePathCandidate;
            break;
        }
    }

    if (!soundFilePath) return false;

    // if a sound file was found ...
    // play the sound
    playSound(voiceChannel, soundFilePath);

    return true;
}


// plays a sound if msg matches a sound file and sender is in a vc
// returns true if a sound was played, false otherwise
function handleSoundMessages(msg) {
    // return if sender is not in vc or if he is a bot
    if (!msg.member  || !msg.member.voice.channel) return false;
    if (!msg.author ||  msg.author.bot)           return false;
    
    let soundPlayed = attemptPlayingSoundFromText(msg.content, msg.member.voice.channel);

    if (!soundPlayed) return false;

    msg.react('⏹️');
    msg.react('🔁');  // TODO may arrive in wrong order

    // update last used voice channel for notifications
    lastVoiceChannel = msg.member.voice.channel;

    return true;
}

// instantiate Discord client ('MESSAGE', 'CHANNEL', 'REACTION' partials needed for global reaction listening)
let Discord = require('discord.js');
let client  = new Discord.Client({ partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });


// play sound on 🔁 react and stop playing on ⏹️
client.on('messageReactionAdd', async (react, user) => {
    // The replay button and soundboards are only triggerable inside vcs, stop button is triggerable from anywhere

    // When we receive a reaction we check if the reaction is partial or not
    if (react.partial) {
        // If the message this reaction belongs to was removed the fetching might result in an API error, which we need to handle
        try {
            await react.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the message: ', error);
            // Return as `react.message.author` may be undefined/null
            return;
        }
    }

    // prevent bots triggering commands
    if (user.bot) return;
    // ignore private messages
    if (!react.message.guild) return;

    let guild = react.message.guild;
    let msg   = react.message;
    let emoji = react.emoji.name;


    if (msg.channel.type == 'text') {
        // save lastTextChannel for notifications
        lastTextChannel = msg.channel;
    }

    // guild, user -> guildMember
    let guildMember = guild.members.cache.find( it => it.id === user.id );

    if (!guildMember) {
        // should never occur but idk
        throw 'guild.members.cache.find( it => it.id === user.id ) failed';
        return;
    }


    // soundboards
    if (msg.id in soundboards) {
        if (emoji in soundboards[msg.id]) {
            // user may not be in a voice channel
            if (!guildMember.voice.channel) return;
            
            attemptPlayingSoundFromText(soundboards[msg.id][emoji], guildMember.voice.channel);

            // save last used voice channel for notifications
            lastVoiceChannel = guildMember.voice.channel;
        }
    }
    // stop/replay buttons
    else {
        if (emoji === '⏹️') {
            // stop audio playback
            if (guild.me && guild.me.voice &&
                guild.me.voice.connection && guild.me.voice.connection.dispatcher) {
                console.log('stopping');
                guild.me.voice.connection.dispatcher.pause();
            }
        } else if (emoji === '🔁') {
            // user may not be in a voice channel
            if (!guildMember.voice.channel) return;
            
            attemptPlayingSoundFromText(msg.content, guildMember.voice.channel);

            // save last used voice channel for notifications
            lastVoiceChannel = guildMember.voice.channel;
        }
    }
});


client.on('message', msg => {
    if (msg.channel.type == 'text') {
        // save lastTextChannel for notifications
        lastTextChannel = msg.channel;
    }
    let commandTriggered = handleCommands(msg);
    let soundTriggered   = handleSoundMessages(msg);
});


// watch sound files dir for new sounds with Hound
const NEW_SOUND_NOTIFICATION_SOUND = 'hereyougo.ogg';

let watcher = hound.watch(soundFilesPath);
watcher.on('create', (filePath, stats) => {
    console.log(filePath, 'created!');
    if (lastVoiceChannel && lastTextChannel) {
        let fileName = filePath.split('/').pop();
        playSound(lastVoiceChannel, path.join(soundFilesPath, NEW_SOUND_NOTIFICATION_SOUND));
        lastTextChannel.send(`Your precious ${fileName}, gratefully accepted! We will need it.`).catch(console.error);
    }
});


client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});


client.login(botToken);
