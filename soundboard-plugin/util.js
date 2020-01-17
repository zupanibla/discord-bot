const fs = require('fs');
const path = require('path');

module.exports = soundsPath => {


function findSoundFile(name) {
    let pth = path.join(soundsPath, name);
    for (ext of ['', '.ogg', '.mp3'])
        if (fs.existsSync(pth + ext)) return pth + ext;
    return false;
};


const soundList = () => fs.readdirSync(soundsPath).map(v => v.split('.')[0]).join(', ');


const soundCodeFromMessage = msg => msg.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '');


function stopPlayback(voiceChannel, reason='') {
    if ( voiceChannel.connection && voiceChannel.connection.dispatcher )
        voiceChannel.connection.dispatcher.end(reason);
};


const voiceChannelFromMessage = msg => (msg.member && msg.member.voiceChannel) ? msg.member.voiceChannel : null;

const splitTooLongMessage = msg => msg.match(/(.{1,1900}(\s|$))\s*/g);

return {findSoundFile, soundCodeFromMessage, soundList, stopPlayback, voiceChannelFromMessage, splitTooLongMessage};


};
