/* SquadBot XMPP bot for Camelot Unchained using Node.js

To use, run `node cu-squadbot.js`

Requires:
 - Node.js 11.x
 - node-xmpp
 - request
 - github
 - moment
 - bluebird*
 - Camelot Unchained account

* The bluebird module is only required when using older versions of Node.js
which don't have Promise support.

Optional:
 - node-pushover - Needed to send Pushover notifications.
 - aws-sdk - Needed to send push notifications (SMS/email/etc.) via AWS SNS.

*/

var sys = require('sys');
var util = require('util');
var path = require('path');
var fs = require('fs');
var request = require('request');
var xmpp = require('node-xmpp');
var GitHubApi = require('github');
var moment = require('moment');

var cuRestAPI = require('./cu-rest.js');
var config = require('./cu-squadbot.cfg');

if (typeof Promise === 'undefined') Promise = require('bluebird');

// Chat command definitions
var commandChar = '!';
var chatCommands = [
{ // #### HELP COMMAND ####
    command: 'help',
    help: "The command " + commandChar + "help displays help for using the various available bot commands.\n" +
        "\nUsage: " + commandChar + "help [command]\n" +
        "\nAvailable commands: ##HELPCOMMANDS##",
    exec: function(server, room, sender, message, extras) {
        var params = getParams(this.command, message);

        if (params.length > 0) {
            for (var i = 0; i < chatCommands.length; i++) {
                if (chatCommands[i].command == params) {
                    sendReply(server, room, sender, chatCommands[i].help);
                }
            }
        } else {
            sendReply(server, room, sender, this.help);
        }
    }
},
{ // #### BOTINFO COMMAND ####
    command: 'botinfo',
    help: "The command " + commandChar + "botinfo displays information about this chatbot.\n" +
        "\n" + "Usage: " + commandChar + "botinfo",
    exec: function(server, room, sender, message, extras) {
        sendReply(server, room, sender, "The bot is written in Node.js and is running on an OpenShift gear. Source code for the bot can be found here: https://github.com/CUModSquad/SquadBot" +
            "\n\nMuch thanks to the CU Mod Squad for their help.");
    }
},
{ // #### TIPS COMMAND ####
    command: 'tips',
    help: "The command " + commandChar + "tips displays tips for new Mod Squad members.\n" +
        "\n" + "Usage: " + commandChar + "tips [user]\n" +
        "\nIf [user] is specified, tips will be sent to that user. If 'chat' is specified as the user, tips will be sent to chat.", 
    exec: function(server, room, sender, message, extras) {
        var params = getParams(this.command, message);
        if (params.length > 0) {
            var pn = params.split(' ')[0].toLowerCase();
            if (pn !== 'chat') {
                if (room === 'pm') {
                    // Only allow tips requested via PM to be sent to requester to avoid abuse
                    sendReply(server, room, sender, "Tips sent to " + sender.split("@")[0] + ".");
                } else {
                    // send message as PM to specified user
                    sendReply(server, room, sender, "Tips sent to " + pn + ".");
                    room = 'pm';
                    sender = pn + '@' + server.address;
                }
            }
        } else {
            // send message as PM to user calling !tips
            sendReply(server, room, sender, "Tips sent to " + sender.split("@")[0] + ".");
            if (room !== 'pm') {
                room = 'pm';
                sender = sender + '@' + server.address;               
            }
        }

        sendReply(server, room, sender, "Quick Tips: Welcome to the Mod Squad. Tips coming soon(tm)!");
    }
},
{ // #### MOTD COMMAND ####
    command: 'motd',
    help: "The command " + commandChar + "motd allows setting and viewing the MOTD for the Mod Squad.\n" +
        "\nUsage: " + commandChar + "motd [new MOTD]",
    exec: function(server, room, sender, message, extras) {
        if (extras && extras.motdadmin) {
            var motdadmin = extras.motdadmin;
        } else {
            var motdadmin = false;
        }

        var params = getParams(this.command, message);
        var targetServer = server;

        if (params.length > 0) {
            // User is trying to set a new MOTD.
            if (motdadmin) {
                // User is allowed - Set new MOTD.
                fs.writeFile(targetServer.motdFile, "MOTD: " + params, function(err) {
                    if (err) {
                        return util.log("[ERROR] Unable to write to MOTD file.");
                    }
                    targetServer.motd = "MOTD: " + params;
                    sendReply(server, room, sender, "MOTD for " + targetServer.name + " set to: " + params);
                    util.log("[MOTD] New MOTD for server '" + targetServer.name + "' set by user '" + sender + "'.");
                });
            } else {
                // User is not allowed - Send error.
                sendReply(server, room, sender, "You do not have permission to set an MOTD.");
            }
        } else {
            // User requested current MOTD.
            if (room === 'pm') {
                sendPM(server, targetServer.motd.toString(), sender);
                util.log("[MOTD] MOTD sent to user '" + sender + "' on " + server.name + ".");
            } else {
                sendChat(server, targetServer.motd.toString(), room);
                util.log("[MOTD] MOTD sent to '" + server.name + '/' + room.split('@')[0] + "' per user '" + sender + "'.");
            }
        }
    }
},
{ // #### MOTDOFF COMMAND ####
    command: 'motdoff',
    help: "The command " + commandChar + "motdoff allows users to stop receiving a Message of the Day for a particular server.\n" +
        "\nUsage: " + commandChar + "motdoff [server]\n" +
        "\nIf [server] is specified, all actions will apply to that server. Otherwise, they will apply to the current server.",
    exec: function(server, room, sender, message, extras) {
        var ignoredReceiver = false;
        var targetServer = server;

        targetServer.motdIgnore.forEach(function(receiver) {
            if (receiver === sender) ignoredReceiver = true;
        });

        if (! ignoredReceiver) {
            // Add user to MOTD ignore list
            targetServer.motdIgnore.push(sender);
            fs.writeFile(targetServer.nomotdFile, JSON.stringify(targetServer.motdIgnore), function(err) {
                if (err) {
                    return util.log("[ERROR] Unable to write to MOTD Ignore file.");
                }
                sendReply(server, room, sender, "User '" + sender + "' unsubscribed from " + targetServer.name + " MOTD notices.");
                util.log("[MOTD] User '" + sender + "' added to '" + targetServer.name + "' opt-out list.");
            });
        } else {
            // Tell user they already have MOTDs turned off
            sendReply(server, room, sender, "User '" + sender + "' already unsubscribed from " + targetServer.name + " MOTD notices.");
        }
    }
},
{ // #### MOTDON COMMAND ####
    command: 'motdon',
    help: "The command " + commandChar + "motdon allows users to start receiving a Message of the Day for a particular server.\n" +
        "\nUsage: " + commandChar + "motdon [server]\n" +
        "\nIf [server] is specified, all actions will apply to that server. Otherwise, they will apply to the current server.",
    exec: function(server, room, sender, message, extras) {
        var ignoredReceiver = false;
        var targetServer = server;

        targetServer.motdIgnore.forEach(function(receiver) {
            if (receiver === sender) ignoredReceiver = true;
        });

        if (ignoredReceiver) {
            // Remove user from MOTD ignore list
            for (var i = 0; i < targetServer.motdIgnore.length; i++) {
                if (targetServer.motdIgnore[i] === sender) {
                    index = i;
                    break;
                }
            }
            targetServer.motdIgnore.splice(index, 1);

            fs.writeFile(targetServer.nomotdFile, JSON.stringify(targetServer.motdIgnore), function(err) {
                if (err) {
                    return util.log("[ERROR] Unable to write to MOTD Ignore file.");
                }
                sendReply(server, room, sender, "User '" + sender + "' subscribed to " + targetServer.name + " MOTD notices.");
                util.log("[MOTD] User '" + sender + "' removed from '" + targetServer.name + "' opt-out list.");
            });
        } else {
            // Tell user they already have MOTDs turned on
            sendReply(server, room, sender, "User '" + sender + "' already subscribed to " + targetServer.name + " MOTD notices.");
        }
    }
},
{ // #### CONTRIBS COMMAND ####
    command: 'contribs',
    help: "The command " + commandChar + "contribs displays all contributors to monitored groups on GitHub.\n" +
        "\n" + "Usage: " + commandChar + "contribs",
    exec: function(server, room, sender, message, extras) {
        var contribUsers = [];
        var contribList = "";
        getAllContribs().then(function(contribs) {
            if (contribs.length > 0) {
                for (i = 0; i < contribs.length; i++) {
                    if (contribUsers.indexOf(contribs[i].login) === -1) contribUsers.push(contribs[i].login);
                }
                for (i = 0; i < contribUsers.length; i++) {
                    if (contribList.length > 0) contribList += ", ";
                    contribList += contribUsers[i];
                }
                sendReply(server, room, sender, "Contributing users to all monitored GitHub groups: " + contribList);
            } else {
                sendReply(server, room, sender, "No contributors found for monitored GitHub groups.");
            }
        });
    }
},
{ // #### PRS COMMAND ####
    command: 'prs',
    help: "The command " + commandChar + "prs displays current pull requests for all monitored groups on GitHub.\n" +
        "\n" + "Usage: " + commandChar + "prs",
    exec: function(server, room, sender, message, extras) {
        var pullURLs = "";
        getAllPullRequests().then(function(prs) {
            if (prs.length > 0) {
                prs.forEach(function(pr, index) {
                    pullURLs += "\n   " + (index + 1) + ": " + pr.html_url;
                });
                sendReply(server, room, sender, "There are currently " + prs.length + " pull requests open against all monitored GitHub groups:" + pullURLs);
            } else {
                sendReply(server, room, sender, "No pull requests found for monitored GitHub groups.");
            }
        });
    }
},
{ // #### ISSUES COMMAND ####
    command: 'issues',
    help: "The command " + commandChar + "issues displays current issues for all monitored groups on GitHub.\n" +
        "\n" + "Usage: " + commandChar + "issues",
    exec: function(server, room, sender, message, extras) {
        var issueURLs = "";
        getAllIssues().then(function(issues) {
            if (issues.length > 0) {
                issues.forEach(function(issue, index) {
                    issueURLs += "\n   " + (index + 1) + ": " + issue.html_url;
                });
                sendReply(server, room, sender, "There are currently " + issues.length + " issues open against all monitored GitHub groups:" + issueURLs);
            } else {
                sendReply(server, room, sender, "No issues found for monitored GitHub groups.");
            }
        })
    }
},
];

// Add list of available commands to the output of !help
var commandList = "";
chatCommands.forEach(function(cmd) {
    if (commandList.length > 0) commandList = commandList + ", ";
    commandList = commandList + cmd.command;
});
chatCommands[0].help = chatCommands[0].help.replace("##HELPCOMMANDS##", commandList);

/*****************************************************************************/
/*****************************************************************************/

// function to check internet connectivity
function checkInternet(server, callback) {
    require('dns').lookup(server.address, function(err) {
        if (err && err.code == "ENOTFOUND") {
            callback(false);
        } else {
            callback(true);
        }
    })
}

// function to obtain all contributors for every repo owned by all monitored users
function getAllContribs() {
    return new Promise(function (fulfill, reject) {
        var allContribs = [];
        getAllRepos().then(function(repos) {
            var repoCount = repos.length;
            repos.forEach(function(repo) {
                gitAuth();
                github.repos.getContributors({
                    user: repo.owner.login,
                    repo: repo.name
                }, function(err, res) {
                    repoCount--;
                    if (! err) {
                        allContribs = allContribs.concat(res);
                    } else {
                        util.log("[ERROR] Error pulling list of contributors for '" + repo.owner.login + "/" + repo.name + "'.");
                    }
                    if (repoCount === 0) fulfill(allContribs);
                });
            });
        });
    });
}

// function to obtain all events for every repo owned by all monitored users
function getAllEvents() {
    return new Promise(function (fulfill, reject) {
        var allEvents = [];
        var groupCount = config.githubGroups.length;
        config.githubGroups.forEach(function(ghUser, index, array) {
            gitAuth();
            github.events.getFromOrg({
                org: ghUser
            }, function(err, res) {
                groupCount--;
                if (! err) {
                    allEvents = allEvents.concat(res);
                } else {
                    util.log("[ERROR] Error pulling list of events for '" + ghUser + "'.");
                }
                if (groupCount === 0) fulfill(allEvents);
            });
        });
    });
}

// function to obtain all issues for every repo owned by all monitored users
function getAllIssues() {
    return new Promise(function (fulfill, reject) {
        var allIssues = [];
        getAllRepos().then(function(repos) {
            var repoCount = repos.length;
            repos.forEach(function(repo) {
                gitAuth();
                github.issues.repoIssues({
                    user: repo.owner.login,
                    repo: repo.name,
                    state: 'open'
                }, function(err, res) {
                    repoCount--;
                    if (! err) {
                        allIssues = allIssues.concat(res);
                    } else {
                        util.log("[ERROR] Error pulling list of issues for '" + repo.owner.login + "/" + repo.name + "'.");
                    }
                    if (repoCount === 0) fulfill(allIssues);
                });
            });
        });
    });
}

// function to obtain all pull reqeusts for every repo owned by all monitored users
function getAllPullRequests() {
    return new Promise(function (fulfill, reject) {
        var allPullRequests = [];
        getAllRepos().then(function(repos) {
            var repoCount = repos.length;
            repos.forEach(function(repo, index, array) {
                gitAuth();
                github.pullRequests.getAll({
                    user: repo.owner.login,
                    repo: repo.name
                }, function(err, res) {
                    repoCount--;
                    if (! err) {
                        allPullRequests = allPullRequests.concat(res);
                    } else {
                        util.log("[ERROR] Error pulling list of pull requests for '" + repo.owner.login + "/" + repo.name + "'.");
                    }
                    if (repoCount === 0) fulfill(allPullRequests);
                });
            });
        });
    });
}

// function to obtain all repos owned by all monitored groups
function getAllRepos() {
    return new Promise(function (fulfill, reject) {
        var allRepos = [];
        var groupCount = config.githubGroups.length;
        config.githubGroups.forEach(function(ghUser, index, array) {
            gitAuth();
            github.repos.getFromOrg({
                org: ghUser
            }, function(err, res) {
                groupCount--;
                if (! err) {
                    allRepos = allRepos.concat(res);
                } else {
                    util.log("[ERROR] Error pulling list of repositories for '" + ghUser + "'.");
                }
                if (groupCount === 0) fulfill(allRepos);
            });
        });
    });    
}

// function to read in the MOTD file
function getMOTD(server) {
    fs.readFile(server.motdFile, function(err, data) {
        if (err && err.code === 'ENOENT') {
            fs.writeFile(server.motdFile, "MOTD: ", function(err) {
                if (err) {
                    return util.log("[ERROR] Unable to create MOTD file.");
                }
                util.log("[STATUS] MOTD file did not exist. Empty file created.");
            });
            server.motd = "MOTD: ";
        } else {
            server.motd = data;
        }
    });
}

// function to read in the MOTD ignore list
function getMOTDIgnore(server) {
    fs.readFile(server.nomotdFile, function(err, data) {
        if (err && err.code === 'ENOENT') {
            server.motdIgnore = [];
            fs.writeFile(server.nomotdFile, JSON.stringify(server.motdIgnore), function(err) {
                if (err) {
                    return util.log("[ERROR] Unable to create MOTD Ignore file.");
                }
                util.log("[STATUS] MOTD Ignore file did not exist. Empty file created.");
            });
        } else {
            server.motdIgnore = JSON.parse(data);
        }
    });
}

// function to get parameters from a message
function getParams(command, message, index) {
    re = new RegExp('^' + commandChar + command +'[\ ]*', 'i');
    params = message.replace(re, '');
    if (params.length > 0) {
        if (index === undefined) {
            return params;
        } else {
            return params.split(' ')[index];
        }
    } else {
        return -1;
    }
}

// function to read in the saved GitHub pull request data
function getGitHubData() {
    fs.readFile(config.githubFile, function(err, data) {
        if (err && err.code === 'ENOENT') {
            githubData = {
                lastCommit: "2007-10-01T00:00:00.000Z",
                lastIssue: "2007-10-01T00:00:00.000Z",
                lastPR: "2007-10-01T00:00:00.000Z"
            };
            fs.writeFile(config.githubFile, JSON.stringify(githubData), function(err) {
                if (err) {
                    return util.log("[ERROR] Unable to create GitHub data file.");
                }
                util.log("[STATUS] GitHub data file did not exist. Empty file created.");
            });
        } else {
            githubData = JSON.parse(data);
        }
    });
}

// function to authenticate with GitHub API
function gitAuth() {
    github.authenticate({
        type: "basic",
        username: config.githubUsername,
        password: config.githubAPIToken
    });
}

// function to find the index of a room
var indexOfRoom = function(server, room) {
    for (var i = 0; i < server.rooms.length; i++) {
        if (server.rooms[i].name === room) return i;
    }
    return -1;
};

// function to find the index of a server
var indexOfServer = function(server) {
    for (var i = 0; i < config.servers.length; i++) {
        if (config.servers[i].name === server) return i;
    }
    return -1;
};

// function to check if game server is up
function isGameServerUp(server, attempt, callback) {
    server.cuRest.getServers().then(function(data) {
        for (var i = 0; i < data.length; i++) {
            if (data[i].name.toLowerCase() === server.name.toLowerCase()) {
                callback(true);
                return;
            }
        }
        callback(false);
    }, function(error) {
        // Retry twice before giving up.
        if (attempt < 2) {
            isGameServerUp(server, attempt+1, callback);
        } else {
            util.log("[ERROR] Unable to query servers API.");
            callback(false);
        }
    });
}

// function to check if user is an MOTD admin
var isMOTDAdmin = function(name) {
    for (var i = 0; i < config.motdAdmins.length; i++) {
        if (config.motdAdmins[i] === name) return true;
    }
    return false;
};

// function to check if a message matches test keywords
var isTestMessage = function(message) {
    for (var i = 0; i < config.testKeywords.length; i++) {
        re = new RegExp(config.testKeywords[i], 'i');
        if (message.search(re) != -1) return true;
    }
    return false;
};

function random(howMany) {
    chars = "abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUWXYZ0123456789";
    var rnd = require('crypto').randomBytes(howMany)
        , value = new Array(howMany)
        , len = chars.length;

    for (var i = 0; i < howMany; i++) {
        value[i] = chars[rnd[i] % len]
    };

    return value.join('');
}

// function to send a message to a group chat
function sendChat(server, message, room) {
    client[server.name].xmpp.send(new xmpp.Element('message', { to: room + '/' + server.nickname, type: 'groupchat' }).c('body').t(message));
}

// function to send a private message
function sendPM(server, message, user) {
    client[server.name].xmpp.send(new xmpp.Element('message', { to: user, type: 'chat' }).c('body').t(message));
}

// function to send Pushover notification
function sendPushover(user, title, message) {
    var pushover = require('node-pushover');
    var push = new pushover({token: config.poAppToken});
    push.send(user, title, message);
}

// function to send a reply message
function sendReply(server, room, sender, message) {
    if (room === 'pm') {
        sendPM(server, message, sender);
    } else {
        sendChat(server, message, room);
    }
}

// function to send SMS notification
function sendSMS(phone, message) {
    var url = "http://textbelt.com/text?number=" + phone + "&message=" + message;
    var req = {
        headers: {'content-type' : 'application/x-www-form-urlencoded'},
        url: 'http://textbelt.com/text',
        body: 'number=' + phone + '&message=' + message
    };
    request.post(req, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            if (! JSON.parse(body).success) {
                util.log("[ERROR] Error sending SMS: " + JSON.parse(body).message);
            }
        }
    });
}

// function to send AWS SNS notification
function sendSNS(arn, message, subject) {
    var AWS = require('aws-sdk');
    AWS.config.region = 'us-east-1';
    var sns = new AWS.SNS();

    var params = {
      Message: message,
      Subject: subject,
      TopicArn: arn
    };

    sns.publish(params, function(err, data) {
        if (err) util.log("[ERROR] Error sending SNS: " + err);
    });
}

// function to send a server notification to Alpha players
function sendToAlpha(message) {
    config.poAlphaNotices.forEach(function(poID) {
        sendPushover(poID, "[CU]", message);
    });
    config.snsAlphaNotices.forEach(function(arn) {
        sendSNS(arn, message, message);
    });
}

// function to send a server notification to Beta1 players
function sendToBeta1(message) {
    config.poBeta1Notices.forEach(function(poID) {
        sendPushover(poID, "[CU]", message);
    });
    config.snsBeta1Notices.forEach(function(arn) {
        sendSNS(arn, message, message);
    });
}

// function to send a server notification to Beta2 players
function sendToBeta2(message) {
    config.poBeta2Notices.forEach(function(poID) {
        sendPushover(poID, "[CU]", message);
    });
    config.snsBeta2Notices.forEach(function(arn) {
        sendSNS(arn, message, message);
    });
}

// function to send a server notification to Beta3 players
function sendToBeta3(message) {
    config.poBeta3Notices.forEach(function(poID) {
        sendPushover(poID, "[CU]", message);
    });
    config.snsBeta3Notices.forEach(function(arn) {
        sendSNS(arn, message, message);
    });
}

// function to send a server notification to IT players
function sendToIT(message) {
    config.poITNotices.forEach(function(poID) {
        sendPushover(poID, "[CU]", message);
    });
    config.snsITNotices.forEach(function(arn) {
        sendSNS(arn, message, message);
    });
}

// Timer to verify client is still connected
var timerConnected = function(server) { return setInterval(function() { checkLastStanza(server); }, 1000); };
function checkLastStanza(server) {
    var epochTime = Math.floor((new Date).getTime() / 1000);
    if (epochTime - server.lastStanza > 65) {
        util.log("[ERROR] No stanza for 65 seconds on " + server.name + ". Reconnecting...");
        server.lastStanza = epochTime;
        restartClient(server);
    }
}

// Timer to monitor GitHub and announce updates
var timerGitHub = function(server) { return setInterval(function() { checkGitHub(server); }, 30000); };
function checkGitHub(server) {
    var curISODate = new Date().toISOString();
    var newIssueData = false;
    var newPRData = false;
    var tempLastIssue = githubData.lastIssue;
    var tempLastPR = githubData.lastPR;

    // Poll for all events
    getAllEvents().then(function(events) {
        for (i = 0; i < events.length; i++) {
            var event = events[i];

            // Handle Issue Events
            if (event.type === 'IssuesEvent') {
                var diff = moment(event.payload.issue.updated_at).diff(githubData.lastIssue);
                if (diff > 0) {
                    // Save new issue date
                    if (moment(event.payload.issue.updated_at).diff(tempLastIssue) > 0) tempLastIssue = event.payload.issue.updated_at;
                    newIssueData = true;

                    // Announce new information to chat room
                    if (event.payload.issue.created_at !== event.payload.issue.updated_at) {
                        var chatMessage = "An existing issue for '" + event.repo.name + "' has been updated by " + event.actor.login + ":" +
                        "\n" + event.payload.issue.html_url;
                    } else {
                        var chatMessage = "A new issue for '" + event.repo.name + "' has been opened by " + event.actor.login + ":" +
                        "\n" + event.payload.issue.html_url;
                    }
                    server.rooms.forEach(function(room) {
                        if (room.announce && githubData.lastIssue !== '2007-10-01T00:00:00.000Z') sendChat(server, chatMessage, room.name + "@" + server.service + "." + server.address);
                    });
                }
            }

            if (event.type === 'PullRequestEvent') {
                var diff = moment(event.payload.pull_request.updated_at).diff(githubData.lastPR);
                if (diff > 0) {
                    // Save new PR date
                    if (moment(event.payload.pull_request.updated_at).diff(tempLastPR) > 0) tempLastPR = event.payload.pull_request.updated_at;
                    newPRData = true;

                    // Announce new information to chat room
                    if (event.payload.pull_request.created_at !== event.payload.pull_request.updated_at) {
                        var chatMessage = "An existing pull request for '" + event.repo.name + "' has been updated by " + event.actor.login + ":" +
                        "\n" + event.payload.pull_request.html_url;
                    } else {
                        var chatMessage = "A new pull request for '" + event.repo.name + "' has been opened by " + event.actor.login + ":" +
                        "\n" + event.payload.pull_request.html_url;
                    }
                    server.rooms.forEach(function(room) {
                        if (room.announce && githubData.lastPR !== '2007-10-01T00:00:00.000Z') sendChat(server, chatMessage, room.name + "@" + server.service + "." + server.address);
                    });
                }
            }

            if (event.type === 'IssueCommentEvent') {
                if (event.payload.issue.pull_request) {
                    // Comment is for a pull request
                    var diff = moment(event.payload.issue.updated_at).diff(githubData.lastPR);
                    if (diff > 0) {
                        // Save new PR date
                        if (moment(event.payload.issue.updated_at).diff(tempLastPR) > 0) tempLastPR = event.payload.issue.updated_at;
                        newPRData = true;

                        // Announce new information to chat room
                        if (event.payload.issue.created_at !== event.payload.issue.updated_at) {
                            var chatMessage = "An existing pull request for '" + event.repo.name + "' has been updated by " + event.actor.login + ":" +
                            "\n" + event.payload.issue.html_url;
                        } else {
                            var chatMessage = "A new pull request for '" + event.repo.name + "' has been opened by " + event.actor.login + ":" +
                            "\n" + event.payload.issue.html_url;
                        }
                        server.rooms.forEach(function(room) {
                            if (room.announce && githubData.lastPR !== '2007-10-01T00:00:00.000Z') sendChat(server, chatMessage, room.name + "@" + server.service + "." + server.address);
                        });
                    }
                } else {
                    // Comment is for an issue
                    var diff = moment(event.payload.issue.updated_at).diff(githubData.lastIssue);
                    if (diff > 0) {
                        // Save new issue date
                        if (moment(event.payload.issue.updated_at).diff(tempLastIssue) > 0) tempLastIssue = event.payload.issue.updated_at;
                        newIssueData = true;

                        // Announce new information to chat room
                        if (event.payload.issue.created_at !== event.payload.issue.updated_at) {
                            var chatMessage = "An existing issue for '" + event.repo.name + "' has been updated by " + event.actor.login + ":" +
                            "\n" + event.payload.issue.html_url;
                        } else {
                            var chatMessage = "A new issue for '" + event.repo.name + "' has been opened by " + event.actor.login + ":" +
                            "\n" + event.payload.issue.html_url;
                        }
                        server.rooms.forEach(function(room) {
                            if (room.announce && githubData.lastIssue !== '2007-10-01T00:00:00.000Z') sendChat(server, chatMessage, room.name + "@" + server.service + "." + server.address);
                        });
                    }
                }
            }
        }
        if (newIssueData || newPRData) {
            githubData.lastIssue = tempLastIssue;
            githubData.lastPR = tempLastPR;
            fs.writeFile(config.githubFile, JSON.stringify(githubData), function(err) {
                if (err) {
                    util.log("[ERROR] Unable to write GitHub data file.");
                }
                util.log("[STATUS] GitHub data file updated with new information.");
            });
        }
    });
}

// Timer to send MOTD messages to joining users.
var timerMOTD = function(server) { return setInterval(function() { sendMOTD(server); }, 500); };
function sendMOTD(server) {
    server.motdReceivers.forEach(function(receiver) {
        var epochTime = Math.floor((new Date).getTime() / 1000);
        if ((epochTime - receiver.joinTime > 2) && receiver.sendTime === 0) {
            // User joined 2 seconds ago, send the MOTD.
            receiver.sendTime = epochTime;
            var user = receiver.name + '@' + server.address;
            sendPM(server, server.motd.toString(), user);
            util.log("[MOTD] MOTD sent to user '" + receiver.name + "' on " + server.name + ".");
        } else if ((receiver.sendTime > 0) && (epochTime - receiver.sendTime > 300)) {
            // User was sent MOTD 5 minutes ago, remove from receiver list so they can get it again.
            for (var i = 0; i < server.motdReceivers.length; i++) {
                if (server.motdReceivers[i].name === receiver.name) {
                    index = i;
                    break;
                }
            }
            server.motdReceivers.splice(index, 1);
        }
    });
}

// function to start a new client for a particular server
function startClient(server) {
    // Verify internet connectivity or node-xmpp will barf
    checkInternet(server, function(isConnected) {
        if (! isConnected) {
            util.log("[ERROR] No network connectivity. Retrying in 2 seconds...");
            setTimeout(function() { startClient(server); }, 2000);
            return;
        } else {
            // Start to XMPP client
            client[server.name] = {
                xmpp: new xmpp.Client({
                    jid: server.username + '/bot-' + random(6),
                    password: server.password,
                    reconnect: true
                })
            };

            // client[server.name].xmpp.connection.socket.setTimeout(0);
            // client[server.name].xmpp.connection.socket.setKeepAlive(true, 10000);

            // Handle client errors
            client[server.name].xmpp.on('error', function(err) {
                if (err.code === "EADDRNOTAVAIL" || err.code === "ENOTFOUND") {
                    util.log("[ERROR] Unable to resolve the server's DNS address (" + server.name + ").");
                } else if (err.code === "ETIMEDOUT") {
                    util.log("[ERROR] Connection timed out (" + server.name + ").")
                } else {
                    util.log("[ERROR] Unknown " + err);
                }
            });

            // Handle disconnect
            client[server.name].xmpp.on('disconnect', function() {
                server.rooms.forEach(function(room) {
                    room.joined = false;
                });
                util.log("[STATUS] Client disconnected from " + server.name + ". Reconnecting...");
            });

            // Once connected, set available presence and join rooms
            client[server.name].xmpp.on('online', function() {
                util.log("[STATUS] Client connected to " + server.name + ".");

                // Set ourselves as online
                client[server.name].xmpp.send(new xmpp.Element('presence', { type: 'available' }).c('show').t('chat'));

                // Join rooms (and request no chat history)
                server.rooms.forEach(function(room) {
                    var roomJID = room.name + '@' + server.service + '.' + server.address;
                    client[server.name].xmpp.send(new xmpp.Element('presence', { to: roomJID + '/' + server.nickname }).
                        c('x', { xmlns: 'http://jabber.org/protocol/muc' })
                    );
                    util.log("[STATUS] Client joined '" + room.name + "' on " + server.name + ".");
                });

                // Start sending MOTDs
                client[server.name].motdTimer = timerMOTD(server);

                // Start monitoring GitHub activity
                client[server.name].githubTimer = timerGitHub(server);

                // Start verifying client is still receiving stanzas
                server.lastStanza = Math.floor((new Date).getTime() / 1000);
                client[server.name].connTimer = timerConnected(server);

            });

            // Parse each stanza from the XMPP server
            client[server.name].xmpp.on('stanza', function(stanza) {

                 // util.log('***** ' + stanza + ' *****');

                // Store time of last received stanza for checking connection status
                server.lastStanza = Math.floor((new Date).getTime() / 1000);

                // Always log error stanzas
                if (stanza.attrs.type === 'error') {
                    util.log("[ERROR] " + stanza);
                    return;
                }
             
                if (stanza.is('presence')) {
/*****************************************************************************/
// Handle channel joins/parts
/*****************************************************************************/
                    if (stanza.getChild('x') !== undefined) {
                        var status = stanza.getChild('x').getChild('status');
                        var role = stanza.getChild('x').getChild('item').attrs.role;
                        var sender = stanza.attrs.from;
                        var senderName = stanza.attrs.from.split('/')[1];
                        var room = stanza.attrs.from.split('@')[0];
                        var roomIndex = indexOfRoom(server, room);

                        if (server.rooms[roomIndex].joined && server.rooms[roomIndex].motd && role !== 'none') {
                            // Check to see if user is already on list to receive the MOTD.
                            var existingReceiver = false;
                            server.motdReceivers.forEach(function(receiver) {
                                if (receiver.name == senderName) existingReceiver = true;
                            });

                            // Check to see if user is on the ignore list.
                            var ignoredReceiver = false;
                            server.motdIgnore.forEach(function(receiver) {
                                if (receiver == senderName) ignoredReceiver = true;
                            });

                            // If new user and not on ignore list, add to MOTD receiver list.
                            if (! existingReceiver && ! ignoredReceiver) {
                                server.motdReceivers.push({ name: senderName, joinTime: Math.floor((new Date).getTime() / 1000), sendTime: 0 });
                            }
                            util.log("[STATUS] User '" + senderName + "' joined '" + room + "' on " + server.name + ".");
                        }

                        // Status code 110 means initial nicklist on room join is complete
                        if (status == "<status code=\"110\"/>") {
                            server.rooms[roomIndex].joined = true;
                        }
                    }
                } else if (stanza.is('message') && stanza.attrs.type === 'groupchat') {
/*****************************************************************************/
// Handle group chat messages
/*****************************************************************************/
                    var body = stanza.getChild('body');
                    // message without body is probably a topic change
                    if (! body) {
                        return;
                    }

                    var message = body.getText();
                    var sender = stanza.attrs.from.split('/')[1];
                    var senderName = sender.split('@')[0];
                    var room = stanza.attrs.from.split('/')[0];
                    var roomName = room.split('@')[0];
                    if (stanza.getChild('cseflags')) {
                        var cse = stanza.getChild('cseflags').attrs.cse;
                    }
                    var roomIsMonitored = server.rooms[indexOfRoom(server, roomName)].monitor;

                    if (cse === "cse" || isMOTDAdmin(senderName)) {
                        motdadmin = true;
                    } else motdadmin = false;

                    // If message matches a defined command, run it
                    if (message[0] === commandChar) {
                        var userCommand = message.split(' ')[0].split(commandChar)[1].toLowerCase();
                        chatCommands.forEach(function(cmd) {
                            if (userCommand === cmd.command.toLowerCase()) {
                                cmd.exec(server, room, sender, message, {motdadmin: motdadmin});
                            }
                        });
                    }
                } else if (stanza.is('message') && stanza.attrs.type === 'chat') {
/*****************************************************************************/
// Handle private messages
/*****************************************************************************/
                    var body = stanza.getChild('body');
                    // message without body is probably a topic change
                    if (! body) {
                        return;
                    }

                    var message = body.getText();
                    var sender = stanza.attrs.from;
                    var senderName = sender.split('@')[0];
                    if (stanza.getChild('cseflags')) {
                        var cse = stanza.getChild('cseflags').attrs.cse;
                    }

                    if (cse === "cse" || isMOTDAdmin(senderName)) {
                        motdadmin = true;
                    } else motdadmin = false;

                    // If message matches a defined command, run it
                    if (message[0] === commandChar && server.allowPMCommands) {
                        var userCommand = message.split(' ')[0].split(commandChar)[1];
                        chatCommands.forEach(function(cmd) {
                            if (userCommand === cmd.command) {
                                cmd.exec(server, 'pm', sender, message, {motdadmin: motdadmin});
                            }
                        });
                    }
                } else {
/*****************************************************************************/
// Ignore everything else
/*****************************************************************************/
                    return;
                }
            });
        }
    });
}

// function to stop a client for a particular server
function stopClient(server) {
    if (typeof client[server.name] !== 'undefined' && typeof client[server.name].xmpp !== 'undefined') {
        client[server.name].xmpp.connection.reconnect = false;
        // client[server.name].xmpp.removeAllListeners('error');
        client[server.name].xmpp.removeAllListeners('disconnect');
        client[server.name].xmpp.removeAllListeners('online');
        client[server.name].xmpp.removeAllListeners('stanza');
        client[server.name].xmpp.end();
        client[server.name].xmpp = undefined;
        server.rooms.forEach(function(room) {
            room.joined = false;
        });
        clearInterval(client[server.name].motdTimer);
        clearInterval(client[server.name].githubTimer);
        clearInterval(client[server.name].connTimer);
        client[server.name] = undefined;
    }
}

// function to restart a client for a particular server
function restartClient(server) {
    stopClient(server);
    startClient(server);
}

// Initial GitHub startup
var githubData = {};
getGitHubData();
var github = new GitHubApi({
    version: "3.0.0",
    debug: false,
    protocol: "https",
    host: "api.github.com", 
    timeout: 5000,
    headers: {
        "user-agent": "CU-SquadBot"
    }
});

// Initial XMPP client startup
var client = [];
config.servers.forEach(function(server) {
    // Connect to REST API
    server.cuRest = new cuRestAPI(server.name);

    // Server initialization
    getMOTD(server);
    getMOTDIgnore(server);
    server.motdReceivers = [];

    // Start XMPP client
    startClient(server);
});