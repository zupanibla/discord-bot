module.exports = (discordClient, soundsPath) => {

const {findSoundFile, soundCodeFromMessage, soundList, stopPlayback, voiceChannelFromMessage, splitTooLongMessage} = require('./util.js')(soundsPath);


// command message handler
discordClient.on('message', msg => {

    if ( ['list', 'help', 'listcommands', 'sounds', 'listsounds'].includes(msg.content) )
        splitTooLongMessage(soundList()).forEach( part => msg.reply(part) );
    

    if ( ['stop', 'skip'].includes(msg.content) )
        if (voiceChannelFromMessage(msg)) stopPlayback(voiceChannelFromMessage(msg))


    if ( ['bot ostan tle'].includes(msg.content) )
        dontDisconnect = true;

    if ( ['bot ne ostat tle'].includes(msg.content) )
        dontDisconnect = false;

    if ( ['bot pejt stran', 'bot odstran se', 'dc'].includes(msg.content) )
        disconnectFromAll();
});

let dontDisconnect = true;

function disconnectFromAll() {
    for (let [id, channel] of discordClient.channels) {
        if (channel.leave) channel.leave();
    }
}

 // sound code message handler
discordClient.on('message', msg => {

    let soundCode = soundCodeFromMessage(msg.content);

    if (!soundCode) return;

    let filePath = findSoundFile( soundCode );

    if (voiceChannelFromMessage(msg) && filePath)
        voiceChannelFromMessage(msg).join()
            .then(con => {
                if (con.speaking) con.dispatcher.end('override');

                const dispatcher = con.playFile(filePath, {passes:2});

                dispatcher.on('end', reason => {
                    if (reason != 'override') 
                        if (!dontDisconnect) con.disconnect();
                });
                
                dispatcher.on('start', start => console.log('start! ', filePath));
                dispatcher.on('end', reason => console.log('end! ' + reason));
                dispatcher.on('error', err => console.log);
            })
            .catch(console.error);
});

};
