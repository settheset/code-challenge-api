const config = require('config')
const http = require('http')
const render = require('./lib/render')
const logger = require('koa-logger')
const camelizeMiddleware = require('middleware/camelize-middleware')
const bodyParser = require('koa-bodyparser')
const json = require('koa-json')
// const compress = require('koa-compress')
const responseTime = require('koa-response-time')
const removeTrailingSlashes = require('koa-no-trailing-slash')
const conditional = require('koa-conditional-get')
const cors = require('kcors')
const jwt = require('middleware/jwt-middleware')
const etag = require('koa-etag')
const helmet = require('koa-helmet')
const Timeout = require('koa-better-timeout')
const chalk = require('chalk')
const passport = require('config/passport')

const mongoose = require('mongoose')

const Koa = require('koa')
const app = new Koa()

app.keys = [config.secret]

// middleware

if (!config.env.isTest) {
  app.use(responseTime())
  app.use(helmet())
  app.use(logger())
  // cors
  app.use(cors(config.cors))
}

// Camelize keys
app.use(camelizeMiddleware)

// conditional-get
app.use(conditional())

// etag
app.use(etag())

app.use(render)

// remove trailing slashes
app.use(removeTrailingSlashes())

// JWT Middleware
app.use(jwt)

// body parser
app.use(bodyParser(config.bodyParser))

// pretty-printed json responses
app.use(json())

// compress/gzip
// app.use(compress())

// configure timeout
app.use(async(ctx, next) => {
  try {
    const timeout = new Timeout({
      ms: 30000,
      message: 'REQUEST_TIMED_OUT',
    })
    await timeout.middleware(ctx, next)
  } catch (err) {
    ctx.throw(err)
  }
})

// auth
app.use(passport.initialize())

if (config.env.isProd) {
  mongoose.connect(process.env.MONGODB_URI, {
    useMongoClient: true,
    promiseLibrary: global.Promise,
  })
} else if (config.env.isTest) {
  // Use test DB connection. See test/helpers/index.js
} else {
  mongoose.connect(process.env.MONGODB_URI, {
    useMongoClient: true,
    promiseLibrary: global.Promise,
  })
  mongoose.set('debug', true)
}

require('./models/User')
require('./models/Comment')
require('./models/Post')

require('config/passport')

// User Middleware
app.use(require('middleware/user-middleware'))

app.use(require('middleware/error-middleware'))

const routes = require('routes')

app.use(routes.routes())
app.use(routes.allowedMethods())

app.server = require('http-shutdown')(http.createServer(app.callback()))

// 404 handler
// app.use(koa404Handler)

app.shutDown = async function shutDown() {
  let server = this.server

  if (!server || !server.close) return process.exit(0)

  if (server.listening) {
    try {
      await server.close()
      await mongoose.disconnect()

      console.log(chalk.greenBright('[API] 🚫 exiting... bye bye.'))

      process.exit(0)
    } catch (err) {
      console.error(chalk.redBright('error shutting down'))
      process.exit(1)
    }
  }
}

module.exports = app
