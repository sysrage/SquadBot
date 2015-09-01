# SquadBot
An XMPP Chat bot for Mod Squad

### Implemented Commands:

 * **!contribs** - This shows all contributors to any of the monitored GitHub groups. 
 * **!issues** - This shows all open issues for any of the repos owned by any of the monitored GitHub groups.
 * **!motd** - This can show a Mod Squad MOTD.
 * **!motdon** - Subscribe to MOTD notices when joining the channel (currently does nothing).
 * **!motdoff** - Unsubscribe from MOTD notices when joining the channel (currently does nothing).
 * **!prs** - This shows all open pull requests for any of the repos owned by any of the monitored GitHub groups.
 * **!tips** - This can show tips related to Mod Squad activities.

### Current Features:
 * The bot will monitor the Mod Squad conference room for new joins. It will send a Mod Squad MOTD to those users. This is currently disabled.
 * The bot will monitor the GitHub API and automatically announce new or updated pull requests to the Mod Squad conference room.
 * The bot will monitor the GitHub API and automatically announce new or updated issues to the Mod Squad conference room.
 
### Planned Features:
 * Allow filtering of !issues and !prs based on supplied repo name.
 * Add !repos to view all monitored repositories.
 * The bot will monitor the Trello API and automatically announce new or updated cards.
 
