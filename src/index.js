const LoopbackClient = require('loopback-nodejs-client')
const Gamedig = require('gamedig')
const config = require('./config')

const loopbackClient = new LoopbackClient(config.apiBaseUrl, config.credentials.user, config.credentials.password)
var mainLoopInterval
var servers
const UNREACHABLE_COUNT_BEFORE_DELETION = 100
var unreachableServers = {}

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
        // server is up, data was received
        if(unreachableServers.hasOwnProperty(element.id)) {
            delete unreachableServers[element.id]
        }
        updateServerState(element.id, true, state.name.trim(), state.map, state.players.length, state.bots.length, state.maxplayers)
    }).catch((err) => {
        if(config.logging.verbose) {
            console.log((new Date()).toISOString() + ' Query on ' + element.ipport + ' (id ' + element.id + ') failed: ' + err)
        }

        if(unreachableServers.hasOwnProperty(element.id)) {
            unreachableServers[element.id]++;
        }
        else {
            unreachableServers[element.id] = 0;
        }

        if(unreachableServers[element.id] > UNREACHABLE_COUNT_BEFORE_DELETION) {
            if(config.logging.enabled) {
                console.log((new Date()).toISOString() + ' server ' + element.id + ' (' + ipport + ') failed to be reached for ' + unreachableServers[element.id] + ' consecutive retries. deleting from database...')
            }
            servers.deleteById(element.id)
                .then(function (value) {
                    if(value.count == 1) {
                        delete unreachableServers[element.id]
                    }
                })
                .catch(function(err) {
                    console.error((new Date()).toISOString() + ' failed to remove ' + element.id + ' from the database: ' + JSON.stringify(err))
                })
        }
        else {
            updateServerState(element.id, false)
        }
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
    loopbackClient.createToken()
    .then(function() {
        servers = loopbackClient.getModel('Servers')

        if(config.logging.enabled) {
            console.log((new Date()).toISOString() + ' fetching server list from the api')
        }

        if(config.logging.verbose) {
            console.log((new Date()).toISOString() + ' unreachable server state: ' + JSON.stringify(unreachableServers))
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
    })
    .catch(function (err) {
        console.error((new Date()).toISOString() + ' unable to get auth token. aborting')
        console.error(err)
        process.exit(1)
    })
}

// script starts here
mainLoop()
mainLoopInterval = setInterval(mainLoop, config.pollInterval*1000)