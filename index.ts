console.log(process.version);

// Imports
import fs from 'fs';
import path from 'path';
import { Client, IntentsBitField, Partials, VoiceBasedChannel, Message } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, getVoiceConnection } from '@discordjs/voice';

// Args
if (process.argv.length < 4) {
    console.log('argument fromat is: <bot token> <sound files path> [save file path]');
}
const botToken       = process.argv[2];
const soundFilesPath = process.argv[3];
const saveFilePath   = process.argv[4];

// Instantiate Discord client ('MESSAGE', 'CHANNEL', 'REACTION' partials needed for global reaction listening).
const client  = new Client({
	intents: new IntentsBitField(3276799),
	partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const audioPlayer = createAudioPlayer();

// Map of auto replies: if a message with content x is sent in a channel and
// bot has an auto reply with key x, it will send a message with content
// that corresponds to value at key x.
// Keys are lowercase and alphanumeric.
let autoReplies: {[k: string]: string} = {};

// Attempt to load previous state from save file.
if (saveFilePath) {
    try {
        const saveFileContent = fs.readFileSync(saveFilePath, 'utf-8');
        const saveState = JSON.parse(saveFileContent);

        if (saveState.autoReplies) {
            autoReplies = saveState.autoReplies;
        }
        console.log('loaded save state');
    } catch (err) {}
}

client.on('messageCreate', msg => {
    handleAutoReplies(msg);
    handleCommands(msg);
    handleSoundMessages(msg);
});

// Play sound on 🔁 react and stop playing on ⏹️.
client.on('messageReactionAdd', async (reactOrPartialReact, user) => {
    // Prevent bots from triggering commands.
    if (user.bot) return;

    const react = (reactOrPartialReact.partial) ?
                  await reactOrPartialReact.fetch() :
                  reactOrPartialReact;
    const emoji = react.emoji.name;

    const msg = (react.message.partial) ?
                await react.message.fetch() :
                react.message;

    if (emoji === '⏹️') {
        audioPlayer.stop();
    } else if (emoji === '🔁' && msg.member?.voice.channel) {
        handleSoundMessages(msg);
    }
});

client.login(botToken);

// Play a sound if msg matches a sound file and sender is in a vc.
function handleSoundMessages(msg: Message<boolean>) {
    // Return if sender is a bot.
    if (!msg.author ||  msg.author.bot) return false;

    let wasSoundPlayed = false;

    if (msg.member?.voice.channel) {
        wasSoundPlayed = attemptPlayingSoundFromText(msg.content, msg.member.voice.channel);        
    }

    if (wasSoundPlayed) {
        msg.react('⏹️').then(() => msg.react('🔁'));
    }
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user?.tag}!`);
});

// Send an auto reply and returns true if msg.content matches
// an entry in autoReplies and false otherwise.
function handleAutoReplies(msg: Message<boolean>) {
    // Return if sender is a bot.
    if (msg.author.bot) return;

    if (normalizeText(msg.content) in autoReplies) {
        msg.channel.send(autoReplies[normalizeText(msg.content)]);
    }
}

// Trigger a command if msg matches one.
async function handleCommands(msg: Message<boolean>) {
    if ( ['list', 'help', 'sounds', 'listsounds'].includes(msg.content) ) {
        // List sounds contained in the sound files directory (possibly in multiple messages).
        try {
            const text = fs.readdirSync(soundFilesPath).map(v => v.split('.')[0]).join(', ');
            const textChunks = chunkMessage(text, ' ');

            for (const it of textChunks) {
                msg.reply(it);
            }

            if (textChunks[0] == '') {
                msg.reply('There are no sounds :(');
                return true;
            }
        } catch (err) { console.log(err); }
    }

    else if ( ['stop', 'skip'].includes(msg.content) ) {
        audioPlayer.stop();
    }

    else if ( ['dc', 'leave'].includes(msg.content) ) {
        getVoiceConnection(msg.guild?.id || '')?.destroy();
    }

    else if ( msg.content.startsWith('listlatest') ) {
        // Reply with 'listLength' latest files from 'soundFilesPath' and their creation dates.
        const DEFAULT_LIST_LENGTH = 10;

        const messageInt = parseInt(msg.content.replace(/\D/g,''));

        const listLength = messageInt ? messageInt : DEFAULT_LIST_LENGTH;

        try {
            const sortedFileList =
                fs.readdirSync(soundFilesPath)
                .map((it) =>
                    ({
                        name: it,
                        time: new Date(fs.statSync(soundFilesPath + '/' + it).mtime.getTime()),
                    })
                )
                .sort( (a, b) => b.time.getTime() - a.time.getTime() );

            const text =
                sortedFileList
                .slice(0, listLength)
                .map(it =>
                    it.time.getFullYear() + '/' +
                    String(it.time.getMonth() + 1).padStart(2, '0') + '/' +
                    String(it.time.getDate()     ).padStart(2, '0') + ' ' +
                    String(it.time.getHours()    ).padStart(2, ' ') + ':' +
                    String(it.time.getMinutes()  ).padStart(2, '0') + ' ' +
                    it.name
                )
                .join('\n');

            // Chunk the list if it doesn't fit in a single message.
            const textChunks = chunkMessage(text, '\n');

            if (textChunks[0] == '') {
                msg.reply('There are no sounds :(');
                return true;
            }

            for (const it of textChunks) {
                msg.reply('\n' + it);
            }
        } catch (err) { console.log(err); }
    } else if (msg.content.startsWith('autoreply ')) {
        // Add an entry to autoReplies.
        const args = msg.content.substring('autoreply '.length).split(',');
        if (args.length != 2) return;
        autoReplies[normalizeText(args[0])] = args[1];
        console.log(`new auto reply: ${normalizeText(args[0])} -> ${args[1]}`);

        attemptSavingState();
    } else if (msg.content.startsWith('removeautoreply ')) {
        // Remove an entry from autoReplies.
        const key = msg.content.substring('removeautoreply '.length);
        delete autoReplies[normalizeText(key)];
        console.log(`removed auto reply for: ${normalizeText(key)}`);

        attemptSavingState();
    } else if (['dumpsavefile'].includes(msg.content)) {
        // Attempt to reply with save file contents.
        try {
            msg.reply(fs.readFileSync(saveFilePath, 'utf-8'));
        } catch (err) {
            msg.reply('save file dump failed :(');
        }
    } else if (['listautoreplies'].includes(msg.content)) {
        // Reply with readable print of autoReplies contents.
        const text = Object.entries(autoReplies).map(([k, v]) => `${k} -> ${v}`).join('\n');

        // Chunk the list before sending it
        const textChunks = chunkMessage(text, '\n');

        for (const it of textChunks) {
            msg.reply('\n' + it);
        }

        if (textChunks[0] == '') {
            msg.reply('There are no auto replies :(');
        }
    }
}

// Return lowercased and stripped of non-alphanumeric characters version of message (normal form).
function normalizeText(text: string) {
   return text.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '');
}

// Splits text into an array of as long as possible chunks, but not longer than maxChunkLength
// preferrably separating it with preferredSeparator.
function chunkMessage(text: string, preferredSeparator: string) {
    const MAX_MESSAGE_LENGTH = 1900
    const re = new RegExp(`((.|\n){1,${MAX_MESSAGE_LENGTH}}(${preferredSeparator}|$))`, 'g');
    const textChunks = text.match(re);
    return textChunks ? textChunks : [''];
}

// Try to map text to a sound file from soundFilesPath and play it in voiceChannel.
// Return true if successful.
function attemptPlayingSoundFromText(text: string, voiceChannel: VoiceBasedChannel): boolean {
    // Fetch soundName from message.
    const soundName = normalizeText(text);
    if (!soundName) return false;

    // Attempt to find the corresponding sound file
    let soundFilePath: string | null = null;

    for (const it of [soundName, soundName + '.ogg', soundName + '.mp3']) {
        const soundFilePathCandidate = path.join(soundFilesPath, it);
        if (fs.existsSync(soundFilePathCandidate)) {
            soundFilePath = soundFilePathCandidate;
            break;
        }
    }

    if (soundFilePath) {
        playSound(voiceChannel, soundFilePath);
        return true;
    } else {
        return false;
    }
}

function playSound(channel: VoiceBasedChannel, soundFilePath: string) {
    console.log('attempting to play ' + soundFilePath);
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
    });
    const resource = createAudioResource(soundFilePath);
    audioPlayer.play(resource);
    connection.subscribe(audioPlayer);
}

// Tries to save state to saveFilePath.
function attemptSavingState() {
    console.log('saving state ...');
    if (saveFilePath) {
        const newSaveState = { autoReplies };
        try {
            fs.writeFile(saveFilePath, JSON.stringify(newSaveState), 'utf-8', ()=>0);
        } catch (err) {}
    }
}
