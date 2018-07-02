module.exports = (discordClient, soundsPath) => {

const {findSoundFile, soundCodeFromMessage, soundList, stopPlayback, voiceChannelFromMessage} = require('./util.js')(soundsPath);


// command message handler
discordClient.on('message', msg => {

    if ( ['list', 'help', 'listcommands', 'sounds', 'listsounds'].includes(msg.content) )
        msg.reply(soundList());

    if ( ['stop', 'skip'].includes(msg.content) )
        if (voiceChannelFromMessage(msg)) stopPlayback(voiceChannelFromMessage(msg))
});

 // sound code message handler
discordClient.on('message', msg => {

    let filePath = findSoundFile( soundCodeFromMessage(msg.content) );

    if (voiceChannelFromMessage(msg) && filePath)
        voiceChannelFromMessage(msg).join()
            .then(con => {
                if (con.speaking) con.dispatcher.end('override');

                const dispatcher = con.playFile(filePath, {passes:2});

                dispatcher.on('end', reason => { if (reason != 'override') con.disconnect(); });
                
                dispatcher.on('start', start => console.log('start! ', filePath));
                dispatcher.on('end', reason => console.log('end! ' + reason));
                dispatcher.on('error', err => console.log);
            })
            .catch(console.error);
});

};
