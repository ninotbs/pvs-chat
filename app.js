const express = require('express')
const http = require('http')
const livereload = require('livereload')
const connectLiveReload = require('connect-livereload')
// const { initializeWebsocketServer } = require('./server')

const app = express()
const server = http.createServer(app)

const env = process.env.NODE_ENV || 'development'
if (env !== 'production') {
  const liveReloadServer = livereload.createServer()
  liveReloadServer.server.once('connection', () => {
    setTimeout(() => {
      liveReloadServer.refresh('/')
    }, 100)
  })
  app.use(connectLiveReload())
}


(async function () {
  const serverPort = process.env.PORT || 3000
  server.listen(serverPort, () => {
    console.log(
      `Server started on port ${serverPort} as '${env}' Environment`
    )
  })
})