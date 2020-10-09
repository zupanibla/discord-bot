// log node version
console.log('Node version: ' + process.version);


// imports
const fs       = require('fs');
const path     = require('path');
const hound    = require('hound');


// args
if (process.argv.length < 4) {
    console.log('argument fromat is: <bot token> <sound files path> [save file path]');
}
const botToken       = process.argv[2];
const soundFilesPath = process.argv[3];
const saveFilePath   = process.argv[4];


// instantiate Discord client ('MESSAGE', 'CHANNEL', 'REACTION' partials needed for global reaction listening)
let Discord = require('discord.js');
let client  = new Discord.Client({ partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });


// notifications are sent via the channels bellow
// they should at least update when a sound is played
let lastTextChannel  = null;
let lastVoiceChannel = null;

// list of soundboards: which reaction should trigger which sound on which message
// (soundName: string)[msgId: Snowflake][emojiName: string]
let soundboards = {};


// attempt to load previous state from save file
if (saveFilePath) {
    try {
        let saveFileContent = fs.readFileSync(saveFilePath, 'utf-8');
        let saveState = JSON.parse(saveFileContent);

        if (saveState.soundboards) {
            soundboards = saveState.soundboards;
        }
        console.log('loaded save state');
    } catch (err) {}
}

// tries to save state to saveFilePath
function attemptSavingState() {
    console.log('saving state ...');
    if (saveFilePath) {
        let newSaveState = {
            soundboards,
        };
        try {
            fs.writeFile(saveFilePath, JSON.stringify(newSaveState), 'utf-8', ()=>0);
        } catch (err) {}
    }
}


client.on('message', msg => {
    if (msg.channel.type == 'text') {
        // save lastTextChannel for notifications
        lastTextChannel = msg.channel;
    }

    handleCommands(msg);
    handleSoundMessages(msg);
});


// triggers a command if msg matches one
// returns true if message was a command, false otherwise
async function handleCommands(msg) {
    if ( ['list', 'help', 'listcommands', 'sounds', 'listsounds'].includes(msg.content) ) {
        // list sounds contained in the sound files directory (possibly in multiple messages)
        try {
            let soundList = fs.readdirSync(soundFilesPath).map(v => v.split('.')[0]).join(', ');
            let soundListChunks = soundList.match(/(.{1,1900}(\s|$))\s*/g);
            for (let it of soundListChunks) {
                msg.reply(it);
            }
        } catch (err) { console.log(err); }
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
        try {
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
        } catch (err) { console.log(err); }
    }
    else if (msg.content.startsWith('makesoundboard ')) {
        // makes a soundboard - message with react buttons that trigger sounds
        let args = msg.content.substring('makesoundboard '.length).split(',');
        
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
        }

        // reacts need to wait for each other so they arrive in correct order
        (async () => {
            for (let emoji in soundboards[soundboardMessage.id]) {
                try {  // emoji may not be valid
                    await soundboardMessage.react(emoji);
                } catch (err) {}
            }
        })();
        

        // record newly created soundboard so it gets revived on reloads
        attemptSavingState();
    }
    else return false;
    return true;
}


// plays a sound if msg matches a sound file and sender is in a vc
// returns true if a sound was played, false otherwise
function handleSoundMessages(msg) {
    // return if sender is bot
    if (!msg.author ||  msg.author.bot) return false;

    // find guild member with user id and voice channel (return if not found)
    let guildMember = null;

    for (let [_, g] of client.guilds.cache) {
        for (let [_, m] of g.members.cache) {
            if (m.id === msg.author.id && m.voice.channel) guildMember = m;
        }
    }

    if (!guildMember) return false;

    let soundPlayed = attemptPlayingSoundFromText(msg.content, guildMember.voice.channel);

    if (!soundPlayed) return false;

    msg.react('⏹️').then(() => msg.react('🔁'));

    // update last used voice channel for notifications
    lastVoiceChannel = guildMember.voice.channel;

    return true;
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

    let msg   = react.message;
    let emoji = react.emoji.name;


    if (msg.channel.type == 'text') {
        // save lastTextChannel for notifications
        lastTextChannel = msg.channel;
    }

    // find guild member with user id and voice channel (may not exist)
    let guildMember = null;

    for (let [_, g] of client.guilds.cache) {
        for (let [_, m] of g.members.cache) {
            if (m.id === user.id && m.voice.channel) guildMember = m;
        }
    }


    // soundboards
    if (msg.id in soundboards) {
        if (!guildMember) return;

        if (emoji in soundboards[msg.id]) {            
            attemptPlayingSoundFromText(soundboards[msg.id][emoji], guildMember.voice.channel);

            // save last used voice channel for notifications
            lastVoiceChannel = guildMember.voice.channel;
        }
    }
    // stop/replay buttons
    else {
        if (emoji === '⏹️') {
            let guild = null
            if (react.message.guild) {
                // if reaction is in guild
                guild = react.message.guild;
            } else if (guildMember) {
                // if reaction is in DM and reactee is in vc
                guild = guildMember.guild;
            } else {
                // if reaction is in DM and reactee not in vc
                if (lastVoiceChannel) {
                    guild = lastVoiceChannel.guild;
                }
            }

            // stop audio playback in guild
            if (guild && guild.me && guild.me.voice &&
                guild.me.voice.connection && guild.me.voice.connection.dispatcher) {
                console.log('stopping');
                guild.me.voice.connection.dispatcher.pause();
            }
        } else if (emoji === '🔁') {
            if (!guildMember) return;
            
            attemptPlayingSoundFromText(msg.content, guildMember.voice.channel);

            // save last used voice channel for notifications
            lastVoiceChannel = guildMember.voice.channel;
        }
    }
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
