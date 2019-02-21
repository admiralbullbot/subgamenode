var express = require('express')
var fs = require('fs');
var bodyParser = require('body-parser');
var Steam = require('steam');
var dota2 = require('dota2');
// var protos = require("steam-resources")
var mysql = require('mysql');
global.oldID = 0;



var app = express();
var steamClient = new Steam.SteamClient();
var steamUser = new Steam.SteamUser(steamClient);
var steamFriends = new Steam.SteamFriends(steamClient);
var Dota2 = new dota2.Dota2Client(steamClient, false, false);
var recognisedPeople = {};
var pool = mysql.createPool({
  connectionLimit: 10,
  host: "localhost",
  user: "bullbot",
  password: "censored",
  database: "subgame"
});

steamClient.connect();
app.use(bodyParser.json());

app.get('/newgamecheck', function(req, res) {
  var properties = {
    "matches_requested": 1,
    "include_custom_games": true
  }
  Dota2.requestPlayerMatchHistory(76482434, properties, function(err, data) {
    data.matches.map(match => matchID = match.match_id);
  });

  res.writeHead(200, {
    'Content-Type': 'text/html'
  });

  if (matchID <= global.oldID) {
    global.oldID = matchID;
    res.end('0');
    return;
  }

  global.oldID = matchID;
  res.end(matchID.toString());
});

app.get('/matchdetails/:id', function(req, res) {
  var matchID = req.params.id;
  res.setHeader('Content-Type', 'application/json');
  Dota2.requestMatchDetails(matchID, function(err, data) {
    res.end(JSON.stringify(data));
  });
});

app.post('/addfriend', function(req, res) {
  console.dir(req.body);
  steamID = req.body.steam_id
  code = req.body.code
  recognisedPeople[steamID] = code;
  console.log(recognisedPeople);
  res.writeHead(200, {
    'Content-Type': 'text/html'
  });
  res.end('xD');
});

app.post('/makelobby', function(req, res) {
  parsedRes = req.body;

  var properties = {
    "pass_key": parsedRes.password,
    "custom_game_mode": parsedRes.gamemode.toString(),
    "custom_map_name": parsedRes.mapname,
    "custom_game_id": parsedRes.gamemode,
    "custom_max_players": parsedRes['subsinvited'].length + 1
  }
  console.log(properties);

  Dota2.createPracticeLobby(properties, function(err, data) {
    if (err) {
      console.log(err);
    } else {
      console.log('lobby created');
      Dota2.inviteToLobby('76561198036748162', function(err, data) {
        if (err) {
          console.log(err);
        }
        console.log('user invited');
      });

      for (var userid of parsedRes['subsinvited']) {
        Dota2.inviteToLobby(userid, function(err, data) {
          if (err) {
            console.log(err);
          }
        });
      }
    }
  });
  res.end('xD');
});

app.listen(3005)
console.log('listening')

steamClient.on('connected', function() {
  steamUser.logOn({
    "account_name": "NaM_bot",
    "password": "censored"
  });
});

steamClient.on('logOnResponse', function(logonResp) {
  if (logonResp.eresult == Steam.EResult.OK) {
    steamFriends.setPersonaState(Steam.EPersonaState.Online);
    console.log('logged on');
    steamUser.gamesPlayed([{
      "game_id": "540"
    }]);

    Dota2.launch();
    Dota2.on("ready", function() {
      console.log("Node-dota2 ready.");
    });
    Dota2.on("unready", function onUnready() {
      console.log("Node-dota2 unready.");
    });
    Dota2.on("unhandled", function(kMsg) {
      console.log("UNHANDLED MESSAGE " + dota2._getMessageName(kMsg));
    });
  } else {
    console.log(logonResp.eresult);
  }
});

steamFriends.on('friend', function(steamID, relationship) {
  if (relationship == Steam.EFriendRelationship.RequestRecipient) {
    console.log(steamID);
    steamFriends.addFriend(steamID);
    if (!recognisedPeople.hasOwnProperty(steamID)) {
      steamFriends.sendMessage(steamID, 'Use !sgsteam first')
      setTimeout(function() {
        steamFriends.removeFriend(steamID);
      }, 5000);
      return;
    }
    steamFriends.sendMessage(steamID, 'Enter the code you received in direct messages');
    setTimeout(function() {
      steamFriends.removeFriend(steamID);
      console.log("[STEAM] Removed user " + steamID + " from friends");
      return;
    }, 50000);
  }
});

steamFriends.on('friendMsg', function(steamID, message) {
  console.log(message);
  if ((!recognisedPeople.hasOwnProperty(steamID)) || (!message.replace(/\s/g, '').length)) {
    return;
  }

  if (message != recognisedPeople[steamID]) {
    steamFriends.sendMessage(steamID, 'Incorrect code. Try again');
  } else {
    pool.getConnection(function(err, connection) {
      if (err) throw err;
      var sqlString = "UPDATE member SET verified_steam = 1 WHERE steam_id = '" + steamID + "'";
      connection.query(sqlString, function(err, result) {
        if (err) throw err;
        steamFriends.sendMessage(steamID, 'You have been successfully verified');
        console.log(result.affectedRows);
        connection.release();
      });
    });
    setTimeout(function() {
      delete recognisedPeople[steamID];
      steamFriends.removeFriend(steamID);
    }, 25000);
  }
});


Dota2.on("practiceLobbyUpdate", function(lobby) {
  lobbyChannel = "Lobby_" + lobby.lobby_id;
  Dota2.joinChat(lobbyChannel, dota2.schema.lookupEnum('DOTAChatChannelType_t').values.DOTAChannelType_Lobby);
});

Dota2.on("chatJoin", function(message) {
  setTimeout(function() {
    Dota2.leavePracticeLobby(function(err, data) {
      if (!err) {
        Dota2.abandonCurrentGame();
        if (lobbyChannel) Dota2.leaveChat(lobbyChannel);
      } else {
        console.log(err + ' - ' + JSON.stringify(data));
      }
    }, 10000);
  });
});

steamClient.on('error', function(e) {
  // Some error occurred during logon
  console.log(e);
  steamClient.connect();
});
