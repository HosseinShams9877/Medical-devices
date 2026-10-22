// Match Next's production/development env precedence for administrative scripts.
import nextEnv from '@next/env'
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV === 'development')
