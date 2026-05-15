A Discord bot for playing audio in voice channels. Play audio from YouTube URLs or local sound files, Set up automatic replies.

## Features

- Play audio from YouTube URLs (or search queries) directly in a voice channel
- Play local sound files by name
- Auto-reply to messages with custom responses
- Persist auto-replies across restarts with a save file

## Requirements

- Node.js v19.6.0+  (recommend installing via [fnm](https://github.com/Schniz/fnm))
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) on your PATH
- [ffmpeg](https://ffmpeg.org) on your PATH

## Installation

**1. Install fnm and Node.js**
```bash
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
fnm install 20
fnm use 20
```

**2. Install yt-dlp**
```bash
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp
chmod a+rx ~/.local/bin/yt-dlp
```

**3. Install ffmpeg**
```bash
sudo apt-get install -y ffmpeg
```

**4. Clone and install dependencies**
```bash
git clone https://github.com/zupanibla/discord-bot
cd discord-bot
npm install
```

**5. Create a `.env` file**
```bash
echo 'DISCORD_TOKEN=your_token_here' > .env
```

Get your token from the [Discord Developer Portal](https://discord.com/developers/applications).

**6. Run**
```bash
node node_modules/.bin/tsx index.ts [--sounds <path>] [--save <path>]
```

- `--sounds <path>` — (optional) directory containing `.mp3` or `.ogg` sound files
- `--save <path>` — (optional) path to a JSON file for persisting auto-replies

## Commands

All commands are sent as plain messages in any channel the bot can read.

### YouTube

| Command | Description |
|---|---|
| `play <url or search query>` | Play audio from a YouTube URL or search query in your current voice channel |
| `stop` / `skip` | Stop playback |
| `dc` / `leave` | Disconnect the bot from the voice channel |

React with ⏹️ to stop playback or 🔁 to replay a sound.

### Sound Files

| Command | Description |
|---|---|
| `<sound name>` | Play a matching sound file from the sound files directory |
| `list` / `sounds` / `help` / `listsounds` | List all available sound files |
| `listlatest [n]` | List the `n` most recently added sound files (default: 10) |

Sound files are matched by name (case-insensitive, alphanumeric). Supported formats: `.mp3`, `.ogg`.

### Auto-replies

| Command | Description |
|---|---|
| `autoreply <trigger>,<response>` | Add an auto-reply: bot replies with `response` whenever `trigger` is sent |
| `removeautoreply <trigger>` | Remove an auto-reply |
| `listautoreplies` | List all active auto-replies |
| `dumpsavefile` | Print the contents of the save file |

Triggers are matched case-insensitively and stripped of non-alphanumeric characters.
