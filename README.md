# SquadBot
An XMPP Chat bot for Mod Squad

### Command Syntax:
```
!chatlog <parameters> - Sends a private message containing all chat logs from the conference room. The
                        following parameters are available:
                           -h <number> = Specify the number of hours to include in displayed results
                           -m <number> = Specify the number of minutes to include in displayed results
                           -r <room> = Specify the chat room to include in displayed results
                           -u <user> = Specify the user name to include in displayed results
                           -t <text> = Specify the message text to include in displayed results (regular
                                       expressions allowed)

!contribs             - Shows all contributors to any of the monitored GitHub groups.

!issues [filter]      - Shows all open issues for any of the repos owned by the monitored GitHub
                        organizations. If the [filter] parameter is supplied, results will be filtered.
                        The filter can be formatted as 'organization', 'repo', or 'organization/repo'.

!motd [message]       - Shows a Mod Squad Message Of The Day (MOTD). If user is an admin and [message]
                        is supplied, a new MOTD will be saved.

!motdon               - Subscribes user to MOTD notices when joining the room.

!motdoff              - Unsubscribes user from MOTD notices when joining the room.

!prs [filter]         - This shows all open pull requests for any of the repos owned by the monitored
                        GitHub organizations. If the [filter] parameter is supplied, results will be
                        filtered. The filter can be formatted as 'organization', 'repo', or
                        'organization/repo'.

!repos [org]          - This shows all repositories for the monitored GitHub organizations. If the [org]
                        parameter is supplied, only repositories for that organization will be shown.

 !tips                - This can show tips related to Mod Squad activities.
```

### Current Features:
 * The bot will monitor the Mod Squad conference room for new joins. It will send a Mod Squad MOTD to those users. This is currently disabled.
 * The bot will monitor the GitHub API and automatically announce new or updated pull requests to the Mod Squad conference room.
 * The bot will monitor the GitHub API and automatically announce new or updated issues to the Mod Squad conference room.
 
### Planned Features:
 * Add !whois command to list GitHub, Trello, and CSE usernames for each Mod Squad member.
 * Add !useradd command to add Mod Squad users (for use with !whois command).
 * The bot will monitor the Trello API and automatically announce new or updated cards.
