const WebSocket = require('ws')
const redis = require('redis')

let publisher
let redisClient

const redisExpireTimeInSeconds = 10

let clients = []

const initializeWebsocketServer = async (server) => {
  redisClient = redis.createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || '6379',
    }
  })
  await redisClient.connect()

  const subscriber = redisClient.duplicate()
  await subscriber.connect()

  publisher = redisClient.duplicate()
  await publisher.connect()

  const websocketServer = new WebSocket.Server({ server })
  websocketServer.on('connection', onConnection)
  websocketServer.on('error', console.error)
  await subscriber.subscribe('newMessage', onRedisMessage)
  heartbeat()
}

const onConnection = (ws) => {
  console.log('New websocket connection')
  ws.on('close', () => onclose(ws))
  ws.on('message', (message) => onClientMessage(ws, message))
}

const getUsersFromRedis = async () => {
  let userKeys = await redisClient.keys('user:*')

  let users = []
  for (let i = 0; i < userKeys.length; i++) {
    let user = await redisClient.get(userKeys[i])
    if (user) {
      users.push(JSON.parse(user))
    }
  }
  return users
}

const onClientMessage = async (ws, message) => {
  const messageObject = JSON.parse(message)
  console.log('Received message from client: ' + messageObject.type)
  switch (messageObject.type) {
    case 'user':
      clients = clients.filter((client) => client.ws !== ws)
      clients.push({ ws, user: messageObject.user })
      console.log('Number of clients: ' + clients.length)
      redisClient.set(
          `user:${messageObject.user.id}`,
          JSON.stringify(messageObject.user))
      redisClient.expire(
        `user:${messageObject.user.id}`,
        redisExpireTimeInSeconds
      )
      const message = {
        type: 'pushUsers',
      }
      publisher.publish('newMessage', JSON.stringify(message))
      break
    case 'message':
      publisher.publish('newMessage',
        JSON.stringify(messageObject))
      break
    default:
      console.error('Unknown message type: ' + messageObject.type)
  }
}

const onRedisMessage = async (message) => {
  const messageObject = JSON.parse(message)
  console.log('Received message from redis channel: ' + messageObject.type)
  switch (messageObject.type) {
    case 'message':
      clients.forEach((client) => {
        client.ws.send(JSON.stringify(messageObject))
      })
      break
    case 'pushUsers':
      await pushUsers()
      break
    default:
      console.error('Unknown message type: ' + messageObject.type)
  }
}

const onClose = async (ws) => {
  console.log('Websocket connection closed')
  const client = clients.find((client) => client.ws === ws)
  if (!client) return
  redisClient.del(`user:${client.user.id}`)
  const message = {
    type: 'pushUsers',
  }
  publisher.publish('newMessage', JSON.stringify(message))
  clients = clients.filter((client) => client.ws !== ws)
}

const heartbeat = async () => {
  for (let i = 0; i < clients.length; i++) {
    redisClient
      .expire(`user:${clients[i].user.id}`,
        redisExpireTimeInSeconds)
  }
  await pushUsers()
  setTimeout(heartbeat, (redisExpireTimeInSeconds * 1000) / 2)
}

const pushUsers = async () => {
  const users = await getUsersFromRedis()
  const message = {
    type: 'user',
    users
  }
  clients.forEach((client) => {
    client.ws.send(JSON.stringify(message))
  })
}

module.exports = { initializeWebsocketServer }