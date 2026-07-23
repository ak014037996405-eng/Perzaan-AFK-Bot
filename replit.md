# Minecraft AFK Bot

A Mineflayer-based bot that keeps an Aternos (or any cracked-mode) Minecraft server online 24/7 by automatically joining and staying connected.

## Stack
- **Runtime**: Node.js
- **Bot library**: Mineflayer + mineflayer-pathfinder
- **Web server**: Express (status dashboard on port 5000)

## How to run
```
npm start
```
The bot connects to the configured server and the status dashboard is available at the root URL.

## Configuration
All settings live in `settings.json`:
- `server.ip` / `server.port` / `server.version` — target Minecraft server
- `bot-account.username` — name the bot joins with (offline/cracked mode)
- `utils.anti-afk`, `movement.*` — keep-alive behaviour
- `discord.webhookUrl` — optional Discord alerts on connect/disconnect

## User preferences
- Server: chindismp.play.hosting:25565 (Minecraft 1.21.1)
- Bot username: IAMBOT (offline/cracked mode)
