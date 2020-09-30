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


// triggers a command if msg matches one
// returns true if message was a command, false otherwise
async function handleCommands(msg, textChannel, voiceChannel) {
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
        let args = msg.content.substring('makesoundboard '.length).split(',');
        
        // TODO verify args (throws if emoji doesn't exist)
        // message should be: make soundboard <message> (<sound>, <emoji> )

        let soundboardMessage = await msg.channel.send(args[0]);

        for (let i = 2; i < args.length; i += 2) {
            let soundName = args[i-1];
            let emoji = args[i].replace(/\s/g, '');

            soundboardMessage.react(emoji);
            function registerReactionHandler() {
                soundboardMessage.awaitReactions((r, u) => r.emoji.name === emoji && !u.bot, { max: 1 })
                    .then(collected => {
                        registerReactionHandler();
                        // TODO currently repeats on provided voice channel. is this ok?
                        // TODO calling handleSoundboardMessages is not very elegant 
                        // TODO handleSoundboardMessages should probably be responsible for replay/stop buttons
                        // TODO probably the way to do this is to have a separate function for parsing sound names
                        handleSoundboardMessages({content: soundName}, textChannel, voiceChannel);  // TODO if voiceChannel gets deleted we are in trouble
                    });
            }
            registerReactionHandler();
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


// plays a sound if msg matches a sound file and voiceChannel is present
// returns true if a sound was played, false otherwise
function handleSoundboardMessages(msg, msgChannel, voiceChannel) {
    if (!voiceChannel) return false;

    // attempt to fetch soundName from message (to lowercase, remove non alphanumeric)
    let soundName = msg.content.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '');
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

// instantiate Discord client
let Discord = require('discord.js');
let client  = new Discord.Client();


client.on('message', msg => {
     // to play sounds we first need a voice channel
    // try using user's voice channel, then fall back to last used voice channel
    let voiceChannel = null;
    if (msg.member && msg.member.voice.channel) {
        voiceChannel = msg.member.voice.channel;
    } else if (lastVoiceChannel) {
        voiceChannel = lastVoiceChannel;
    }

    // to send messages we first need a text channel
    // try using msg's channel, then fall back to last used text channel
    let textChannel;
    if (msg.channel) {
        textChannel = msg.channel;
    } else if (lastTextChannel) {
        textChannel = lastTextChannel;
    }

    

    let commandTriggered    = handleCommands(msg, textChannel, voiceChannel);
    let soundboardTriggered = handleSoundboardMessages(msg, textChannel, voiceChannel);
    
    if (commandTriggered || soundboardTriggered) {
        // attempt to update lastVoiceChannel and lastTextChannel
        if (voiceChannel) {
            lastVoiceChannel = voiceChannel;
        }
        if (msg.channel) {
            lastTextChannel = msg.channel;
        }
    }

    // WIP
    if (soundboardTriggered) {
        msg.react('⏹️');
        function registerStopHandler() {
            msg.awaitReactions((r, u) => r.emoji.name === '⏹️' && !u.bot, { max: 1 })
                .then(collected => {
                    registerStopHandler();
                    // stop audio playback
                    if (msg.guild && msg.guild.me && msg.guild.me.voice &&
                        msg.guild.me.voice.connection && msg.guild.me.voice.connection.dispatcher) {
                        console.log('stopping');
                        msg.guild.me.voice.connection.dispatcher.pause();
                    }
                });
        }
        registerStopHandler();
        msg.react('🔁');
        function registerRepeatHandler() {
            msg.awaitReactions((r, u) => r.emoji.name === '🔁' && !u.bot, { max: 1 })
                .then(collected => {
                    registerRepeatHandler();
                    // TODO currently repeats on same voice channel it was first triggered on
                    // TODO calling handleSoundboardMessages is not very elegant 
                    handleSoundboardMessages(msg, textChannel, voiceChannel);  // TODO if voiceChannel gets deleted we are in trouble
                });
        }
        registerRepeatHandler();
    }
    // /WIP
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
