# SquadBot
An XMPP Chat bot for Mod Squad

### Implemented Commands:

 * **!chatlog <hours>** - This sends a private message containing all chat logs from the conference room. The <hours> parameter must be supplied to specify the age of the messages to be included.
 * **!contribs** - This shows all contributors to any of the monitored GitHub groups. 
 * **!issues [filter]** - This shows all open issues for any of the repos owned by the monitored GitHub organizations. If the [filter] parameter is supplied, results will be filtered. The filter format can be 'organization', 'repo', or 'organization/repo'.
 * **!motd** - This can show a Mod Squad MOTD.
 * **!motdon** - Subscribe to MOTD notices when joining the channel (currently does nothing).
 * **!motdoff** - Unsubscribe from MOTD notices when joining the channel (currently does nothing).
 * **!prs [filter]** - This shows all open pull requests for any of the repos owned by the monitored GitHub organizations. If the [filter] parameter is supplied, results will be filtered. The filter format can be 'organization', 'repo', or 'organization/repo'.
 * **!repos [org]** - This shows all repositories for the monitored GitHub organizations. If the [org] parameter is supplied, only repositories for that organization will be shown.
 * **!tips** - This can show tips related to Mod Squad activities.

### Current Features:
 * The bot will monitor the Mod Squad conference room for new joins. It will send a Mod Squad MOTD to those users. This is currently disabled.
 * The bot will monitor the GitHub API and automatically announce new or updated pull requests to the Mod Squad conference room.
 * The bot will monitor the GitHub API and automatically announce new or updated issues to the Mod Squad conference room.
 
### Planned Features:
 * Add !whois command to list GitHub, Trello, and CSE usernames for each Mod Squad member.
 * Add !useradd command to add Mod Squad users (for use with !whois command).
 * The bot will monitor the Trello API and automatically announce new or updated cards.
