import pino from 'pino'

function resolveLevel () {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL
  const idx = process.argv.indexOf('--log-level')
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1]
  return 'info'
}

const logger = pino({
  level: resolveLevel(),
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname'
    }
  }
})

export default logger
