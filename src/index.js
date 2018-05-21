const LoopbackClient = require('loopback-nodejs-client')
const Gamedig = require('gamedig')
const config = require('./config')

const loopbackClient = new LoopbackClient(config.apiBaseUrl, config.credentials.user, config.credentials.password)
var mainLoopInterval
var servers

/* this function queries a single server using game-server-query */
function queryServer(element, index, array) { // necessary prototype for forEach, we will only need the element object
    if(config.logging.verbose) {
        console.log((new Date()).toISOString() + ' Querying ' + element.ipport + ' (id ' + element.id + ')')
    }

    let splitIpPort = element.ipport.split(':', 2)
    let ip = splitIpPort[0]
    let port = splitIpPort[1]

    Gamedig.query({
        type: 'csgo',
        host: ip,
        port: port
    }).then((state) => {
        updateServerState(element.id, true, state.name.trim(), state.map, state.players.length, state.bots.length, state.maxplayers)
    }).catch((err) => {
        if(config.logging.verbose) {
            console.log((new Date()).toISOString() + ' Query on ' + element.ipport + ' (id ' + element.id + ') failed: ' + err)
        }
        updateServerState(element.id, false)
    })
  }
  

/* this function updates a server's state in the database */
function updateServerState(id, is_up, name, map, players, bots, players_max) {
    if(is_up) {
        fields = {
            is_up: is_up,
            name: name,
            map: map,
            players: players,
            bots: bots,
            players_max: players_max,
            is_full: (players >= players_max)
        }
    }
    else {
        fields = {
            is_up: is_up
        }
    }

    if(config.logging.verbose) {
        console.log((new Date()).toISOString() + ' attempting to update state for ' + id + ': ' + JSON.stringify(fields))
    }
    servers.updateAttributesById(id, fields)
        .then(function (server) {
            if(config.logging.verbose) {
                console.log((new Date()).toISOString() + ' successfully updated state for ' + id + ': ' + JSON.stringify(server))
            }
        })
        .catch(function (err) {
            console.error((new Date()).toISOString() + ' failed to update state for ' + id + ': ' + JSON.stringify(err))
        })
  }

/* this function grabs a server list from the database and queries every single server. the query callback will then update the server's state*/
function mainLoop() {
    if(config.logging.enabled) {
        console.log((new Date()).toISOString() + ' fetching server list from the api')
    }
    // get serverlist
    servers.find()
        .then(function (servers) {
            if(config.logging.enabled) {
                console.log((new Date()).toISOString() + ' querying ' + servers.length + ' servers')
            }
            servers.forEach(queryServer)
        })
        .catch(function (err) {
            console.error((new Date()).toISOString() + ' could not fetch the serverlist from the api: ' + err)
        })
}

// script starts here
loopbackClient.createToken()
    .then(function() {
        servers = loopbackClient.getModel('Servers')
        mainLoop()
        mainLoopInterval = setInterval(mainLoop, config.pollInterval*1000)
    })
    .catch(function (err) {
        console.error((new Date()).toISOString() + ' unable to get auth token. aborting')
        console.error(err)
        process.exit(1)
    })